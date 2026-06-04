"""
Integration test fixtures using Testcontainers.

Spins up real PostgreSQL and Redis containers for testing.
Requires Docker to be running. Marked with @pytest.mark.integration.

Usage:
    pytest tests/integration/ -m integration --run-integration
"""

from __future__ import annotations

import os
import uuid
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from testcontainers.postgres import PostgresContainer
from testcontainers.redis import RedisContainer

from src.api.auth import create_access_token
from src.api.deps import get_db, get_prediction_service, get_redis
from src.api.main import app
from tests.conftest import StubPredictionService


def pytest_addoption(parser):
    parser.addoption(
        "--run-integration",
        action="store_true",
        default=False,
        help="Run integration tests that require Docker containers",
    )


def pytest_configure(config):
    config.addinivalue_line("markers", "integration: mark test as requiring Docker containers")


def pytest_collection_modifyitems(config, items):
    if config.getoption("--run-integration"):
        return
    skip_integration = pytest.mark.skip(reason="use --run-integration to run")
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip_integration)


@pytest.fixture(scope="session")
def tenant_id() -> str:
    return str(uuid.uuid4())


@pytest.fixture(scope="session")
def auth_headers(tenant_id: str) -> dict[str, str]:
    token = create_access_token(tenant_id=tenant_id, name="Test Tenant")
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture(scope="session")
async def postgres_container() -> AsyncGenerator[PostgresContainer, None]:
    with PostgresContainer("postgres:15-alpine") as postgres:
        yield postgres


@pytest_asyncio.fixture(scope="session")
async def redis_container() -> AsyncGenerator[RedisContainer, None]:
    with RedisContainer("redis:7-alpine") as redis:
        yield redis


@pytest_asyncio.fixture(scope="session")
async def db_engine(postgres_container: PostgresContainer):
    database_url = postgres_container.get_connection_url().replace(
        "postgresql://", "postgresql+asyncpg://"
    )
    engine = create_async_engine(database_url, echo=True, future=True)

    async with engine.begin() as conn:
        from src.database.models import Base
        await conn.run_sync(Base.metadata.create_all)

    yield engine
    await engine.dispose()


@pytest_asyncio.fixture(scope="session")
async def db_session_factory(db_engine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(db_engine, expire_on_commit=False)


@pytest_asyncio.fixture
async def db_session(db_session_factory) -> AsyncGenerator[AsyncSession, None]:
    async with db_session_factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture(scope="session")
async def redis_client(redis_container: RedisContainer):
    import redis.asyncio as redis
    client = redis.Redis(
        host=redis_container.get_container_host_ip(),
        port=int(redis_container.get_exposed_port(6379)),
        decode_responses=True,
    )
    yield client
    await client.flushdb()
    await client.aclose()


@pytest_asyncio.fixture
async def api_client(db_session_factory, redis_client):
    async def override_get_db():
        async with db_session_factory() as session:
            yield session

    async def override_get_redis():
        return redis_client

    async def override_get_prediction_service():
        return StubPredictionService()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_redis] = override_get_redis
    app.dependency_overrides[get_prediction_service] = override_get_prediction_service

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client

    app.dependency_overrides.clear()
