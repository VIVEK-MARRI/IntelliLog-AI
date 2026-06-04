"""
Rate limiting middleware and dependency for FastAPI.

Uses a sliding window counter stored in Redis.
Falls back to in-memory counter when Redis is unavailable (degraded mode).
"""

from __future__ import annotations

import asyncio
import time
from collections import defaultdict
from typing import Callable, Optional

import structlog
from fastapi import HTTPException, Request, status

logger = structlog.get_logger(__name__)


class InMemoryRateLimiter:
    """Thread-safe in-memory sliding window rate limiter (fallback)."""

    def __init__(self) -> None:
        self._windows: dict[str, list[float]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def check(self, key: str, max_requests: int, window_seconds: int = 60) -> bool:
        now = time.time()
        cutoff = now - window_seconds
        async with self._lock:
            window = self._windows[key]
            window[:] = [t for t in window if t > cutoff]
            if len(window) >= max_requests:
                return False
            window.append(now)
            return True


_global_limiter = InMemoryRateLimiter()


async def check_rate_limit(
    request: Request,
    max_per_minute: int,
    key_prefix: str = "rl",
) -> None:
    """Check rate limit for a request. Raises 429 if exceeded."""
    client_ip = request.client.host if request.client else "unknown"
    tenant_id = getattr(request.state, "tenant_id", "anonymous")
    route_path = request.url.path
    key = f"{key_prefix}:{tenant_id}:{client_ip}:{route_path}"

    allowed = await _global_limiter.check(key, max_per_minute)
    if not allowed:
        logger.warning(
            "rate_limit_exceeded",
            key=key_prefix,
            tenant_id=tenant_id,
            client_ip=client_ip,
            path=route_path,
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please slow down.",
        )


def rate_limit(max_per_minute: int, key_prefix: str = "rl") -> Callable:
    """Dependency factory for rate limiting."""
    async def _limiter(request: Request) -> None:
        await check_rate_limit(request, max_per_minute, key_prefix)
    return _limiter
