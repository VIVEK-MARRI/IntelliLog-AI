"""
Health check router.
"""

import time
from datetime import datetime, timezone

import redis.asyncio as redis
import structlog
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_db, get_redis
from src.api.schemas import HealthResponse, ServiceStatus

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["health"])

# Track startup time
startup_time = time.time()


@router.get("/health", response_model=HealthResponse, tags=["health"])
async def health_check() -> HealthResponse:
    """
    Health check endpoint.
    No authentication required.

    Returns all service statuses and system uptime.
    """
    api_status = ServiceStatus.OK
    db_status = ServiceStatus.OK
    redis_status = ServiceStatus.OK
    model_status = ServiceStatus.OK

    # Check database
    try:
        async for db in get_db():
            try:
                await db.execute(text("SELECT 1"))
                logger.info("health_check", service="database", status="ok")
            except Exception as e:
                logger.warning("health_check", service="database", error=str(e))
                db_status = ServiceStatus.DEGRADED
            finally:
                await db.close()
    except Exception as e:
        logger.error("health_check", service="database", error=str(e))
        db_status = ServiceStatus.DOWN

    # Check Redis (dedicated connection — never close the shared singleton)
    try:
        from src.core.config import get_settings
        _health_settings = get_settings(allow_defaults=True)
        health_redis = redis.from_url(
            _health_settings.redis_url or "redis://localhost:6379/0",
            decode_responses=True,
        )
        await health_redis.ping()
        await health_redis.close()
        logger.info("health_check", service="redis", status="ok")
    except Exception as e:
        logger.warning("health_check", service="redis", error=str(e))
        redis_status = ServiceStatus.DEGRADED

    # Check ML model (basic check)
    try:
        import os

        if os.path.exists("models/model.joblib"):
            logger.info("health_check", service="model", status="ok")
        else:
            logger.warning("health_check", service="model", status="missing")
            model_status = ServiceStatus.DOWN
    except Exception as e:
        logger.warning("health_check", service="model", error=str(e))
        model_status = ServiceStatus.DEGRADED

    # Determine overall status
    overall_status = "healthy"
    if db_status in (ServiceStatus.DOWN, ServiceStatus.DEGRADED):
        overall_status = "degraded"
    if redis_status == ServiceStatus.DOWN:
        overall_status = "degraded"

    # Calculate uptime
    uptime_seconds = int(time.time() - startup_time)

    return HealthResponse(
        status=overall_status,
        api=api_status,
        database=db_status,
        redis=redis_status,
        model=model_status,
        version="1.0.0",
        uptime_seconds=uptime_seconds,
        timestamp=datetime.now(timezone.utc),
    )


@router.get("/health/live", tags=["health"])
async def health_live() -> dict:
    """Return a simple liveness response for container/orchestrator probes."""
    return {"status": "alive"}


@router.get("/health/ready", tags=["health"])
async def health_ready() -> dict:
    """Return readiness after verifying the live backend can reach core services."""
    health = await health_check()
    ready = health.database == ServiceStatus.OK and health.redis == ServiceStatus.OK
    return {
        "status": "ready" if ready else "not_ready",
        "database": health.database,
        "redis": health.redis,
        "model": health.model,
    }
