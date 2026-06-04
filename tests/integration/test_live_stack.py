"""Integration tests against live PostgreSQL + Redis stack."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from src.api.deps import DATABASE_URL, get_db, get_prediction_service, get_redis
from src.api.main import app
from tests.conftest import StubPredictionService
from tests.fixtures.factories import OrderRequestFactory


def _candidate_database_urls() -> list[str]:
    candidates = []
    env_url = os.getenv("DATABASE_URL")
    if env_url:
        candidates.append(env_url)
    candidates.append(DATABASE_URL)
    candidates.append("postgresql+asyncpg://postgres:postgres@localhost:5433/intelliglog")
    candidates.append("postgresql+asyncpg://postgres@localhost:5433/intelliglog")
    return list(dict.fromkeys(candidates))


async def _resolve_database_url() -> str:
    for candidate in _candidate_database_urls():
        try:
            engine = create_async_engine(candidate, echo=False, future=True)
            async with engine.connect() as connection:
                await connection.execute(text("SELECT 1"))
            await engine.dispose()
            return candidate
        except Exception:
            try:
                await engine.dispose()
            except Exception:
                pass
            continue

    pytest.skip("No reachable PostgreSQL instance for integration tests")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_fastapi_postgres_and_redis_round_trip(test_redis, tenant_id, auth_headers) -> None:
    """Full round-trip: create order via API, verify in DB, verify in Redis."""
    resolved_database_url = await _resolve_database_url()
    engine = create_async_engine(resolved_database_url, echo=False, future=True)
    session_maker = async_sessionmaker(engine, expire_on_commit=False)
    order_request = OrderRequestFactory()
    order_request["plannedEta"] = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()

    async def override_get_db():
        async with session_maker() as session:
            yield session

    async def override_get_redis():
        return test_redis

    async def override_get_prediction_service():
        return StubPredictionService()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_redis] = override_get_redis
    app.dependency_overrides[get_prediction_service] = override_get_prediction_service

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            create_response = await client.post("/api/v1/orders", json=order_request, headers=auth_headers)
            assert create_response.status_code == 200

            async with session_maker() as session:
                result = await session.execute(
                    text("SELECT id, tenant_id, driver_id FROM orders WHERE id = :order_id"),
                    {"order_id": order_request["orderId"]},
                )
                row = result.mappings().first()
                assert row is not None
                assert str(row["id"]) == order_request["orderId"]
                assert str(row["driver_id"]) == order_request["driverId"]

            prediction_response = await client.get(
                f"/api/v1/predictions/{order_request['orderId']}", headers=auth_headers
            )
            assert prediction_response.status_code == 200

            channel_message = await test_redis.hgetall(f"order:{order_request['orderId']}")
            assert channel_message["driver_id"] == order_request["driverId"]
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_health_endpoint_integration(test_redis, auth_headers) -> None:
    """Health endpoint returns OK with live dependencies."""
    resolved_database_url = await _resolve_database_url()
    engine = create_async_engine(resolved_database_url, echo=False, future=True)
    session_maker = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with session_maker() as session:
            yield session

    async def override_get_redis():
        return test_redis

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_redis] = override_get_redis

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            response = await client.get("/health")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "healthy"
            assert data["database"] == "ok"
            assert data["redis"] == "ok"
            assert data["api"] == "ok"
            assert "version" in data
            assert "uptime_seconds" in data
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_websocket_endpoint_integration(test_redis, auth_headers, tenant_id) -> None:
    """Verify WebSocket endpoint accepts connections with valid auth."""
    resolved_database_url = await _resolve_database_url()
    engine = create_async_engine(resolved_database_url, echo=False, future=True)

    async def override_get_db():
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            yield session

    async def override_get_redis():
        return test_redis

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_redis] = override_get_redis

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            ws_url = f"/ws/{tenant_id}"
            async with client.websocket_connect(
                ws_url,
                headers={"Sec-WebSocket-Protocol": auth_headers["Authorization"]},
            ) as ws:
                welcome = await ws.receive_json()
                assert welcome["type"] == "connection_established"
                assert welcome["tenant_id"] == tenant_id
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_rate_limiting_integration(test_redis, auth_headers) -> None:
    """Verify rate limiting blocks excessive requests in integration mode."""
    resolved_database_url = await _resolve_database_url()
    engine = create_async_engine(resolved_database_url, echo=False, future=True)
    session_maker = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with session_maker() as session:
            yield session

    async def override_get_redis():
        return test_redis

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_redis] = override_get_redis

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            login_payload = {"email": "test@example.com", "password": "test123"}
            responses = []
            for _ in range(30):
                resp = await client.post("/api/v1/auth/login", json=login_payload)
                responses.append(resp.status_code)

            rate_limited = [s for s in responses if s == 429]
            total_ok = [s for s in responses if s in (200, 400)]

            assert len(rate_limited) > 0, "Rate limiting should have kicked in"
            assert len(total_ok) > 0, "Some requests should have succeeded"
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()
