"""
Executive Summary Service for IntelliLog-AI.

Generates periodic operational summaries using Gemini analysis of live context.
Summaries are stored in PostgreSQL and exposed via the dashboard.

Types:
- operational: Overall fleet operations summary
- risk: Risk posture analysis
- driver: Driver performance summary
- route: Route efficiency summary

Scheduling: Every 15 minutes (configurable via cron expression or interval)
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.services.copilot_prompts import (
    build_summary_prompt,
    SYSTEM_PROMPT,
    validate_response,
)
from src.services.llm_service import GeminiService, get_gemini_service, ResponseValidator

logger = structlog.get_logger(__name__)


class SummaryType(str, Enum):
    OPERATIONAL = "operational"
    RISK = "risk"
    DRIVER = "driver"
    ROUTE = "route"


SUMMARY_INTERVAL_MINUTES = 15


class ExecutiveSummary:
    def __init__(
        self,
        summary_type: SummaryType,
        summary_text: str,
        confidence: float,
        evidence: list[str],
        recommendations: list[str],
        metadata: Optional[dict] = None,
        summary_id: Optional[str] = None,
        created_at: Optional[str] = None,
    ):
        self.summary_id = summary_id
        self.summary_type = summary_type
        self.summary_text = summary_text
        self.confidence = confidence
        self.evidence = evidence
        self.recommendations = recommendations
        self.metadata = metadata or {}
        self.created_at = created_at or datetime.now(timezone.utc).isoformat()


class ExecutiveSummaryService:
    def __init__(self, db: AsyncSession, gemini_service: Optional[GeminiService] = None):
        self.db = db
        self.llm = gemini_service or get_gemini_service()
        self.logger = logger.bind(service="executive_summary")

    async def generate_and_store(
        self,
        tenant_id: str,
        summary_type: SummaryType,
        context_text: str,
    ) -> Optional[ExecutiveSummary]:
        try:
            prompt = build_summary_prompt(context_text, summary_type.value)
            result = await self.llm.generate(
                prompt=prompt,
                system_instruction=SYSTEM_PROMPT,
                required_fields=["summary", "confidence", "evidence", "recommendations"],
            )
            if not result.structured:
                self.logger.warning("summary_generation_failed", type=summary_type.value)
                return None
            validated = validate_response(result.structured)
            if not validated:
                return None
            summary = ExecutiveSummary(
                summary_type=summary_type,
                summary_text=validated.summary,
                confidence=validated.confidence,
                evidence=validated.evidence,
                recommendations=validated.recommendations,
                metadata={
                    "llm_latency_ms": result.latency_ms,
                    "model": result.model,
                    "token_count": result.token_count_total,
                },
            )
            await self._store_in_db(tenant_id, summary)
            self.logger.info(
                "summary_stored",
                type=summary_type.value,
                confidence=summary.confidence,
            )
            return summary
        except Exception as e:
            self.logger.error("summary_generation_error", type=summary_type.value, error=str(e))
            return None

    async def generate_all_types(
        self,
        tenant_id: str,
        context_text: str,
    ) -> list[ExecutiveSummary]:
        summaries = []
        for st in SummaryType:
            summary = await self.generate_and_store(tenant_id, st, context_text)
            if summary:
                summaries.append(summary)
        return summaries

    async def _store_in_db(self, tenant_id: str, summary: ExecutiveSummary):
        try:
            await self.db.execute(
                text("""
                    INSERT INTO executive_summaries
                        (id, tenant_id, summary_type, summary_text, confidence,
                         evidence, recommendations, metadata, created_at)
                    VALUES
                        (gen_random_uuid(), :tenant_id, :summary_type, :summary_text, :confidence,
                         :evidence::jsonb, :recommendations::jsonb, :metadata::jsonb, :created_at::timestamptz)
                """),
                {
                    "tenant_id": tenant_id,
                    "summary_type": summary.summary_type.value,
                    "summary_text": summary.summary_text,
                    "confidence": summary.confidence,
                    "evidence": json.dumps(summary.evidence),
                    "recommendations": json.dumps(summary.recommendations),
                    "metadata": json.dumps(summary.metadata),
                    "created_at": summary.created_at,
                },
            )
            await self.db.commit()
        except Exception as e:
            self.logger.warning("summary_db_store_failed", error=str(e))

    async def get_latest_summaries(
        self,
        tenant_id: str,
        summary_type: Optional[SummaryType] = None,
        limit: int = 5,
    ) -> list[ExecutiveSummary]:
        try:
            type_filter = ""
            params: dict[str, Any] = {"tenant_id": tenant_id, "limit": limit}
            if summary_type:
                type_filter = " AND summary_type = :summary_type"
                params["summary_type"] = summary_type.value
            result = await self.db.execute(
                text(f"""
                    SELECT
                        id::text, summary_type, summary_text, confidence,
                        evidence, recommendations, metadata, created_at::text
                    FROM executive_summaries
                    WHERE tenant_id = :tenant_id{type_filter}
                    ORDER BY created_at DESC
                    LIMIT :limit
                """),
                params,
            )
            rows = result.mappings().all()
            summaries = []
            for row in rows:
                evidence = row.get("evidence", "[]")
                if isinstance(evidence, str):
                    evidence = json.loads(evidence)
                recommendations = row.get("recommendations", "[]")
                if isinstance(recommendations, str):
                    recommendations = json.loads(recommendations)
                metadata = row.get("metadata", "{}")
                if isinstance(metadata, str):
                    metadata = json.loads(metadata)
                summaries.append(ExecutiveSummary(
                    summary_id=row.get("id"),
                    summary_type=SummaryType(row.get("summary_type", "operational")),
                    summary_text=row.get("summary_text", ""),
                    confidence=float(row.get("confidence", 0)),
                    evidence=evidence,
                    recommendations=recommendations,
                    metadata=metadata,
                    created_at=row.get("created_at"),
                ))
            return summaries
        except Exception as e:
            self.logger.warning("get_latest_summaries_failed", error=str(e))
            return []

    async def check_should_generate(self, tenant_id: str, summary_type: SummaryType) -> bool:
        try:
            result = await self.db.execute(
                text("""
                    SELECT created_at
                    FROM executive_summaries
                    WHERE tenant_id = :tenant_id AND summary_type = :summary_type
                    ORDER BY created_at DESC
                    LIMIT 1
                """),
                {"tenant_id": tenant_id, "summary_type": summary_type.value},
            )
            row = result.mappings().first()
            if not row:
                return True
            last_time = row["created_at"]
            if isinstance(last_time, str):
                last_dt = datetime.fromisoformat(last_time)
            else:
                last_dt = last_time.replace(tzinfo=timezone.utc) if last_time.tzinfo is None else last_time
            elapsed = (datetime.now(timezone.utc) - last_dt).total_seconds()
            return elapsed >= SUMMARY_INTERVAL_MINUTES * 60
        except Exception:
            return True
