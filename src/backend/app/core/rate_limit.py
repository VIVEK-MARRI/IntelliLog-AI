"""Redis-backed per-tenant rate limiting using slowapi."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from collections import defaultdict, deque
from urllib.parse import urlparse

from limits import parse as parse_limit
from slowapi import Limiter
import redis

from src.backend.app.core.config import settings


ROLE_HOURLY_LIMITS = {
    "admin": 1000,
    "manager": 500,
    "driver": 200,
    "anonymous": 0,
}
BURST_LIMIT = "60/minute"


@dataclass
class RateLimitExceededError(Exception):
    """Raised when a tenant-scoped limit is exceeded."""

    retry_after_seconds: int
    limit: str


def _redis_available() -> bool:
    """Return True when Redis rate-limit store is reachable."""
    try:
        parsed = urlparse(settings.REDIS_URL)
        client = redis.Redis(
            host=parsed.hostname or "localhost",
            port=parsed.port or 6379,
            db=int((parsed.path or "/0").strip("/") or "0"),
            socket_connect_timeout=0.2,
            socket_timeout=0.2,
            decode_responses=True,
        )
        client.ping()
        return True
    except Exception:
        return False


_use_redis = _redis_available()
_storage_uri = settings.REDIS_URL if _use_redis else "memory://"

limiter = Limiter(
    key_func=lambda request: "unused",
    storage_uri=_storage_uri,
)

_fallback_windows = defaultdict(deque)


def _fallback_hit(key: str, window_seconds: int, max_requests: int) -> bool:
    """Fallback in-memory limiter used when Redis is unavailable."""
    now = datetime.utcnow()
    cutoff = now - timedelta(seconds=window_seconds)
    q = _fallback_windows[key]
    while q and q[0] < cutoff:
        q.popleft()
    if len(q) >= max_requests:
        return False
    q.append(now)
    return True


def _build_rate_key(tenant_id: str, user_id: str, endpoint: str) -> str:
    """Build canonical Redis key segment for this principal and endpoint."""
    return f"rate:{tenant_id}:{user_id}:{endpoint}"


def enforce_rate_limit(request, principal) -> None:
    """Check per-minute burst and per-hour role limit using Redis storage."""
    role = (principal.role or "anonymous").lower()
    hourly_quota = ROLE_HOURLY_LIMITS.get(role, 0)
    if hourly_quota <= 0:
        raise RateLimitExceededError(retry_after_seconds=3600, limit="0/hour")

    endpoint = request.url.path
    base_key = _build_rate_key(principal.tenant_id, principal.user_id, endpoint)

    burst_item = parse_limit(BURST_LIMIT)
    hourly_limit = f"{hourly_quota}/hour"
    hourly_item = parse_limit(hourly_limit)

    burst_key = f"{base_key}:burst"
    hour_key = f"{base_key}:hour"

    if _use_redis:
        if not limiter.limiter.hit(burst_item, burst_key):
            raise RateLimitExceededError(retry_after_seconds=60, limit=BURST_LIMIT)

        if not limiter.limiter.hit(hourly_item, hour_key):
            raise RateLimitExceededError(retry_after_seconds=3600, limit=hourly_limit)
    else:
        # Local development/test fallback when Redis is not available.
        if not _fallback_hit(burst_key, window_seconds=60, max_requests=60):
            raise RateLimitExceededError(retry_after_seconds=60, limit=BURST_LIMIT)
        if not _fallback_hit(hour_key, window_seconds=3600, max_requests=hourly_quota):
            raise RateLimitExceededError(retry_after_seconds=3600, limit=hourly_limit)
