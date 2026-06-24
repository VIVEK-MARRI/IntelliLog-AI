"""
FastAPI dependencies: database, cache, services.
"""

from __future__ import annotations

from typing import Any, AsyncGenerator

import redis.asyncio as redis
import structlog
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.core.config import get_settings
from src.ml.inference import PredictionService

logger = structlog.get_logger(__name__)

_settings = get_settings(allow_defaults=True)

DATABASE_URL = _settings.database_url
REDIS_URL = _settings.redis_url

_engine = None
_async_session_maker: async_sessionmaker[AsyncSession] | None = None


def _get_session_maker() -> async_sessionmaker[AsyncSession]:
    global _engine, _async_session_maker

    if _async_session_maker is None:
        if not DATABASE_URL:
            raise RuntimeError("DATABASE_URL is not configured")
        _engine = create_async_engine(
            DATABASE_URL,
            echo=False,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
            pool_recycle=3600,
        )
        _async_session_maker = async_sessionmaker(
            _engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )

    return _async_session_maker


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency for database session.

    Yields:
        AsyncSession
    """
    async_session_maker = _get_session_maker()

    async with async_session_maker() as session:
        try:
            yield session
        except Exception as e:
            logger.error("database_session_error", error=str(e))
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_redis() -> redis.Redis:
    """
    Dependency for Redis connection.

    If the real Redis server is unreachable (e.g. dev environment without
    Docker), transparently fall back to a module-level fakeredis instance so
    the API stays functional. Production deployments should always use real
    Redis — the fallback exists only for local development convenience.

    Returns:
        Redis client (real or fakeredis)
    """
    global _fakeredis_instance, _real_redis_works

    if _real_redis_works and _real_redis_client is not None:
        return _real_redis_client

    if _fakeredis_instance is not None:
        return _fakeredis_instance

    if not REDIS_URL:
        try:
            import fakeredis.aioredis
            _fakeredis_instance = fakeredis.aioredis.FakeRedis(decode_responses=True)
            logger.warning("redis_using_fakeredis", reason="REDIS_URL not configured")
            return _fakeredis_instance
        except ImportError:
            raise RuntimeError("REDIS_URL is not configured and fakeredis is not available")

    try:
        client = await redis.from_url(
            REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=1,
            socket_timeout=1,
        )
        await client.ping()
        _real_redis_client = client
        _real_redis_works = True
        logger.info("redis_connected", url=REDIS_URL)
        return client
    except Exception as e:
        logger.warning(
            "redis_unavailable_using_fakeredis",
            error=str(e),
            hint="Start Redis or set REDIS_URL to a reachable instance",
        )
        import fakeredis.aioredis

        _fakeredis_instance = fakeredis.aioredis.FakeRedis(decode_responses=True)
        return _fakeredis_instance


_real_redis_client: redis.Redis | None = None
_fakeredis_instance: Any = None
_real_redis_works: bool = False


_prediction_service_instance: PredictionService | None = None


async def get_prediction_service() -> PredictionService:
    """
    Get prediction service singleton.
    Uses a module-level cached instance to avoid reloading the model on every request.

    Returns:
        PredictionService singleton
    """
    global _prediction_service_instance
    if _prediction_service_instance is None:
        try:
            _prediction_service_instance = PredictionService(model_dir="models/")
        except Exception as e:
            logger.error("prediction_service_error", error=str(e))
            raise
    return _prediction_service_instance


async def get_optimization_service(
    redis_client: Any = Depends(get_redis),
) -> Any:
    """
    Get optimization service singleton.

    Args:
        redis_client: Redis client

    Returns:
        OptimizationService
    """
    from src.optimization.service import OptimizationService

    try:
        from src.optimization.tasks import celery_app

        return OptimizationService(redis_client, celery_app=celery_app)
    except Exception:
        return OptimizationService(redis_client)
