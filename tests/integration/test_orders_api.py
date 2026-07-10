"""Integration tests for the orders API and the GPS->agent event pipeline.

These exercise real request paths against the live Docker postgres + redis:
- health endpoint
- order listing / retrieval (seeded data)
- position update publishes to the gps_pings Redis Stream that the agent-worker consumes
"""
import asyncio

import pytest
import redis.asyncio as aioredis

STREAM = "gps_pings"
HIGH_RISK_ORDER = "DEMO-incident-007"  # risk 0.9754 in seed data


def test_health_is_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "healthy"


def test_list_orders_returns_items(client):
    r = client.get("/api/v1/orders")
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert isinstance(body["items"], list)


def test_seeded_order_is_retrievable(client):
    r = client.get(f"/api/v1/orders/{HIGH_RISK_ORDER}")
    assert r.status_code == 200
    assert r.json()["order_id"] == HIGH_RISK_ORDER


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
    client = aioredis.from_url("redis://redis:6379", decode_responses=True)
    try:
        raw = await client.xrevrange(STREAM, count=count)
        out = []
        for _id, fields in raw:
            if fields.get("order_id") == order_id:
                out.append(fields)
        return out
    finally:
        await client.aclose()
