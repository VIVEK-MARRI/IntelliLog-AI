"""
Gemini LLM Service for IntelliLog-AI.

Provides:
- Async Gemini 2.5 Flash inference with structured JSON output
- Circuit breaker pattern (fail after N consecutive errors, reset after timeout)
- Retry with exponential backoff (3 retries)
- Timeout handling (30s default)
- Response validation against expected schema
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, AsyncGenerator, Optional

import asyncio

from google import genai
from google.genai import types as genai_types
from google.genai.errors import APIError as GeminiAPIError, ClientError as GeminiClientError, ServerError as GeminiServerError
import httpx
import structlog

from src.core.config import get_settings

logger = structlog.get_logger(__name__)


# ===== Types =====


class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class LLMResult:
    text: str
    structured: Optional[dict[str, Any]] = None
    finish_reason: str = "unknown"
    latency_ms: float = 0.0
    model: str = "gemini-2.5-flash"
    token_count_total: int = 0
    token_count_prompt: int = 0
    token_count_completion: int = 0


# ===== Circuit Breaker =====


class CircuitBreaker:
    def __init__(
        self,
        failure_threshold: int = 5,
        reset_timeout_seconds: float = 60.0,
        half_open_max_retries: int = 2,
    ):
        self.failure_threshold = failure_threshold
        self.reset_timeout_seconds = reset_timeout_seconds
        self.half_open_max_retries = half_open_max_retries
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time: Optional[datetime] = None
        self.half_open_retries = 0

    def record_success(self):
        if self.state == CircuitState.HALF_OPEN:
            self.half_open_retries = 0
        self.failure_count = 0
        self.state = CircuitState.CLOSED

    def record_failure(self):
        self.failure_count += 1
        self.last_failure_time = datetime.now(timezone.utc)
        if self.failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN
            logger.warning(
                "circuit_breaker_opened",
                failure_count=self.failure_count,
                threshold=self.failure_threshold,
            )

    def allow_request(self) -> bool:
        if self.state == CircuitState.CLOSED:
            return True
        if self.state == CircuitState.OPEN:
            if self.last_failure_time is None:
                return False
            elapsed = (datetime.now(timezone.utc) - self.last_failure_time).total_seconds()
            if elapsed >= self.reset_timeout_seconds:
                self.state = CircuitState.HALF_OPEN
                self.half_open_retries = 0
                return True
            return False
        if self.state == CircuitState.HALF_OPEN:
            if self.half_open_retries < self.half_open_max_retries:
                self.half_open_retries += 1
                return True
            self.state = CircuitState.OPEN
            return False
        return False


# ===== Response Validation =====


class ResponseValidator:
    @staticmethod
    def validate_json_response(text: str, required_fields: list[str]) -> Optional[dict]:
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            try:
                start = text.index("{")
                end = text.rindex("}") + 1
                parsed = json.loads(text[start:end])
            except (ValueError, json.JSONDecodeError):
                return None
        for field in required_fields:
            if field not in parsed:
                return None
        return parsed

    @staticmethod
    def validate_copilot_response(data: dict) -> Optional[dict]:
        required = ["summary", "confidence", "evidence", "recommendations"]
        for field in required:
            if field not in data:
                logger.warning("response_missing_field", field=field)
                return None
        if not isinstance(data.get("evidence"), list):
            return None
        if not isinstance(data.get("recommendations"), list):
            return None
        confidence = data.get("confidence", 0)
        if not isinstance(confidence, (int, float)) or confidence < 0 or confidence > 1:
            data["confidence"] = max(0.0, min(1.0, float(confidence)))
        return data


# ===== Gemini Service =====


class GeminiService:
    def __init__(
        self,
        model_name: str = "gemini-2.5-flash",
        timeout_seconds: float = 30.0,
        max_retries: int = 3,
    ):
        settings = get_settings(allow_defaults=True)
        api_key = settings.gemini_api_key or ""

        self._disabled = False
        self._client: Optional[genai.Client] = None

        if not api_key:
            logger.warning("gemini_no_api_key", message="GEMINI_API_KEY not set. LLM calls will be simulated.")
            self._disabled = True
        else:
            try:
                self._client = genai.Client(api_key=api_key)
                logger.info("gemini_client_initialized", model=model_name)
            except Exception as e:
                logger.warning("gemini_client_failed", error=str(e))
                self._disabled = True

        self.model_name = model_name
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries
        self.circuit_breaker = CircuitBreaker()
        self.logger = logger.bind(service="gemini")

    async def generate(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        required_fields: Optional[list[str]] = None,
    ) -> LLMResult:
        if self._disabled or self._client is None:
            return self._fallback_response(prompt)

        if not self.circuit_breaker.allow_request():
            self.logger.warning("circuit_breaker_blocked_request")
            return self._fallback_response(prompt, error="circuit_breaker_open")

        last_error: Optional[str] = None
        for attempt in range(1, self.max_retries + 1):
            try:
                start_time = time.time()

                config_kwargs = {
                    "model": self.model_name,
                    "contents": prompt,
                    "config": genai_types.GenerateContentConfig(
                        temperature=0.2,
                        top_p=0.95,
                        max_output_tokens=4096,
                        response_mime_type="application/json",
                    ),
                }

                if system_instruction:
                    config_kwargs["config"] = genai_types.GenerateContentConfig(
                        temperature=0.2,
                        top_p=0.95,
                        max_output_tokens=4096,
                        response_mime_type="application/json",
                        system_instruction=genai_types.Content(
                            parts=[genai_types.Part(text=system_instruction)]
                        ),
                    )

                response = await self._client.aio.models.generate_content(**config_kwargs)  # type: ignore

                latency_ms = (time.time() - start_time) * 1000
                result = self._process_response(response, latency_ms)

                if required_fields:
                    validated = ResponseValidator.validate_json_response(result.text, required_fields)
                    if not validated:
                        self.logger.warning(
                            "response_validation_failed",
                            attempt=attempt,
                            required_fields=required_fields,
                        )
                        last_error = "response_validation_failed"
                        continue
                    result.structured = validated

                self.circuit_breaker.record_success()
                return result

            except GeminiClientError as e:
                if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e) or "rate" in str(e).lower():
                    self.logger.warning("gemini_rate_limited", attempt=attempt, error=str(e))
                    last_error = "rate_limited"
                else:
                    self.logger.warning("gemini_client_error", attempt=attempt, error=str(e))
                    last_error = f"client_error: {str(e)}"
                await self._backoff(attempt)
            except GeminiServerError as e:
                self.logger.warning("gemini_server_error", attempt=attempt, error=str(e))
                last_error = f"server_error: {str(e)}"
                await self._backoff(attempt)
            except (httpx.TimeoutException, asyncio.TimeoutError) as e:
                self.logger.warning("gemini_timeout", attempt=attempt, error=str(e))
                last_error = "timeout"
                await self._backoff(attempt)
            except Exception as e:
                error_str = str(e)
                if "timeout" in error_str.lower() or "deadline" in error_str.lower():
                    self.logger.warning("gemini_timeout", attempt=attempt, error=error_str)
                    last_error = "timeout"
                else:
                    self.logger.error("gemini_error", attempt=attempt, error=error_str)
                    last_error = f"error: {error_str}"
                await self._backoff(attempt)

        self.circuit_breaker.record_failure()
        return self._fallback_response(prompt, error=last_error)

    async def stream_generate(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        if self._disabled or self._client is None:
            fallback = self._fallback_response(prompt)
            yield json.dumps(fallback.structured if fallback.structured else {"text": fallback.text})
            return

        if not self.circuit_breaker.allow_request():
            self.logger.warning("circuit_breaker_blocked_stream")
            yield json.dumps({"error": "LLM unavailable", "summary": "Service temporarily unavailable. Please try again.", "confidence": 0.0, "evidence": [], "recommendations": []})
            return

        try:
            start_time = time.time()

            config_kwargs = {
                "model": self.model_name,
                "contents": prompt,
                "config": genai_types.GenerateContentConfig(
                    temperature=0.2,
                    top_p=0.95,
                    max_output_tokens=4096,
                ),
            }

            if system_instruction:
                config_kwargs["config"] = genai_types.GenerateContentConfig(
                    temperature=0.2,
                    top_p=0.95,
                    max_output_tokens=4096,
                    system_instruction=genai_types.Content(
                        parts=[genai_types.Part(text=system_instruction)]
                    ),
                )

            self.logger.info("gemini_stream_start")

            # Async streaming path — the SDK's aio method returns a coroutine
            stream_it = await self._client.aio.models.generate_content_stream(**config_kwargs)  # type: ignore
            async for chunk in stream_it:
                if chunk.text:
                    yield chunk.text

            latency_ms = (time.time() - start_time) * 1000
            self.logger.info("gemini_stream_complete", latency_ms=latency_ms)
            self.circuit_breaker.record_success()

        except (GeminiClientError, GeminiServerError, GeminiAPIError) as e:
            self.logger.error("gemini_stream_api_error", error=str(e))
            self.circuit_breaker.record_failure()
            yield json.dumps({"error": str(e)})

        except (httpx.TimeoutException, asyncio.TimeoutError) as e:
            self.logger.error("gemini_stream_timeout", error=str(e))
            self.circuit_breaker.record_failure()
            yield json.dumps({"error": "Request timed out"})

        except TypeError as e:
            error_str = str(e)
            # Python 3.13 httpx compat fallback — use sync streaming in thread
            if "max_line_length" in error_str:
                self.logger.warning("gemini_stream_async_compat_fallback")
                try:
                    loop = asyncio.get_running_loop()
                    queue: asyncio.Queue = asyncio.Queue()

                    def _sync_producer():
                        try:
                            sync_gen = self._client.models.generate_content_stream(**config_kwargs)
                            for chunk in sync_gen:
                                text = chunk.text if hasattr(chunk, "text") and chunk.text else ""
                                if text:
                                    asyncio.run_coroutine_threadsafe(queue.put(text), loop).result()
                        except Exception as exc:
                            asyncio.run_coroutine_threadsafe(queue.put(None), loop).result()
                            raise exc
                        finally:
                            asyncio.run_coroutine_threadsafe(queue.put(StopIteration), loop).result()

                    await loop.run_in_executor(None, _sync_producer)

                    while True:
                        item = await queue.get()
                        if item is StopIteration:
                            break
                        if item is None:
                            raise RuntimeError("sync streaming failed")
                        yield item

                    latency_ms = (time.time() - start_time) * 1000
                    self.logger.info("gemini_stream_complete", latency_ms=latency_ms)
                    self.circuit_breaker.record_success()
                except Exception as sync_err:
                    self.logger.error("gemini_stream_sync_fallback_error", error=str(sync_err))
                    self.circuit_breaker.record_failure()
                    yield json.dumps({"error": str(sync_err)})
            else:
                self.logger.error("gemini_stream_error", error=error_str)
                self.circuit_breaker.record_failure()
                yield json.dumps({"error": error_str})

        except Exception as e:
            self.logger.error("gemini_stream_error", error=str(e))
            self.circuit_breaker.record_failure()
            yield json.dumps({"error": str(e)})

    def _process_response(self, response: Any, latency_ms: float) -> LLMResult:
        text = response.text if hasattr(response, "text") and response.text else ""
        if not text:
            text = str(response)

        token_counts = {}
        if hasattr(response, "usage_metadata") and response.usage_metadata:
            try:
                token_counts = {
                    "total": getattr(response.usage_metadata, "total_token_count", 0) or 0,
                    "prompt": getattr(response.usage_metadata, "prompt_token_count", 0) or 0,
                    "completion": getattr(response.usage_metadata, "candidates_token_count", 0) or 0,
                }
            except Exception:
                pass

        structured = None
        try:
            structured = json.loads(text)
        except (json.JSONDecodeError, ValueError):
            pass

        finish_reason = "unknown"
        if hasattr(response, "candidates") and response.candidates:
            try:
                finish_reason = str(response.candidates[0].finish_reason)
            except Exception:
                pass

        return LLMResult(
            text=text,
            structured=structured,
            finish_reason=finish_reason,
            latency_ms=latency_ms,
            model=self.model_name,
            token_count_total=token_counts.get("total", 0),
            token_count_prompt=token_counts.get("prompt", 0),
            token_count_completion=token_counts.get("completion", 0),
        )

    def _fallback_response(self, prompt: str, error: Optional[str] = None) -> LLMResult:
        text = json.dumps({
            "summary": "LLM service is currently unavailable. Showing data-driven insights based on operational metrics.",
            "confidence": 0.0,
            "evidence": [f"LLM unavailable (reason: {error or 'no_api_key'})"],
            "recommendations": ["Configure GEMINI_API_KEY in environment variables to enable AI-powered insights."],
        })
        return LLMResult(text=text, structured=json.loads(text), model="fallback")

    async def _backoff(self, attempt: int):
        delay = min(2 ** attempt, 10)
        await __import__("asyncio").sleep(delay)


# Singleton
_service_instance: Optional[GeminiService] = None


def get_gemini_service() -> GeminiService:
    global _service_instance
    if _service_instance is None:
        _service_instance = GeminiService()
    return _service_instance
