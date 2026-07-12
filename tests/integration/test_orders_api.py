"""Integration tests for the orders API and the GPS→agent event pipeline.

These exercise real request paths against the live Docker postgres + redis:
- health endpoint
- order listing / retrieval (seeded data)
- position update publishes to the gps_pings Redis Stream that the agent-worker consumes

Requires a live PostgreSQL + Redis stack. Run with:
    pytest tests/integration/ -m integration --run-integration
"""
import asyncio
import os

import pytest
import redis.asyncio as aioredis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from src.api.deps import DATABASE_URL

async def _check_db():
    try:
        engine = create_async_engine(DATABASE_URL, echo=False, future=True)
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        await engine.dispose()
        return True
    except Exception:
        return False

@pytest.fixture(autouse=True, scope="module")
def skip_if_no_db():
    import asyncio
    # Run simple check in sync context
    loop = asyncio.new_event_loop()
    is_up = loop.run_until_complete(_check_db())
    loop.close()
    if not is_up:
        pytest.skip("No reachable PostgreSQL instance for integration tests")

STREAM = "gps_pings"
HIGH_RISK_ORDER = "DEMO-incident-007"  # risk 0.9754 in seed data


@pytest.mark.integration
def test_health_is_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "healthy"


@pytest.mark.integration
def test_list_orders_returns_items(client):
    r = client.get("/api/v1/orders")
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert isinstance(body["items"], list)


@pytest.mark.integration
def test_seeded_order_is_retrievable(client):
    r = client.get(f"/api/v1/orders/{HIGH_RISK_ORDER}")
    assert r.status_code == 200
    assert r.json()["order_id"] == HIGH_RISK_ORDER


@pytest.mark.integration
def test_position_update_publishes_to_gps_stream(client):
    payload = {
        "lat": 40.7128,
        "lng": -74.006,
        "speed_kmh": 42,
        "heading": 180,
        "event_type": "gps_ping",
    }
    r = client.patch(f"/api/v1/orders/{HIGH_RISK_ORDER}/position", json=payload)
    assert r.status_code == 200
    assert r.json()["received"] is True

    # Confirm the event actually landed on the gps_pings stream the agent consumes.
    entries = asyncio.run(_read_recent(HIGH_RISK_ORDER))
    assert any(e.get("order_id") == HIGH_RISK_ORDER for e in entries), (
        "position update was not published to the gps_pings stream"
    )


async def _read_recent(order_id: str, count: int = 20):
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")
    client = aioredis.from_url(redis_url, decode_responses=True)
    try:
        raw = await client.xrevrange(STREAM, count=count)
        out = []
        for _id, fields in raw:
            if fields.get("order_id") == order_id:
                out.append(fields)
        return out
    finally:
        await client.aclose()
