from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

import pytest

from tests.fixtures.factories import OrderRequestFactory, PositionUpdateFactory


@pytest.mark.performance
@pytest.mark.asyncio
async def test_create_order_throughput(api_client, auth_headers) -> None:
    start = time.perf_counter()
    for _ in range(100):
        order_request = OrderRequestFactory()
        order_request["planned_eta"] = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        response = await api_client.post("/api/v1/orders", json=order_request, headers=auth_headers)
        assert response.status_code == 200

    elapsed = time.perf_counter() - start
    assert elapsed < 8.0


@pytest.mark.performance
@pytest.mark.asyncio
async def test_prediction_latency_and_order_updates(api_client, auth_headers, test_redis) -> None:
    order_request = OrderRequestFactory()
    order_request["planned_eta"] = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    resp = await api_client.post("/api/v1/orders", json=order_request, headers=auth_headers)
    order_id = resp.json()["orderId"]

    await test_redis.hset(
        f"order:{order_id}",
        mapping={
            "driver_id": order_request["driver_id"],
            "planned_stops": 10,
            "completed_stops": 3,
            "planned_duration_minutes": 240.0,
            "actual_duration_so_far_minutes": 100.0,
            "stops_remaining": 7,
            "eta_minutes_remaining": 50.0,
            "speed": 30.0,
            "deviation_meters": 90.0,
            "driver_on_time_rate": 0.85,
        },
    )

    start = time.perf_counter()
    for _ in range(50):
        response = await api_client.get(f"/api/v1/predictions/{order_id}", headers=auth_headers)
        assert response.status_code == 200
    prediction_elapsed = time.perf_counter() - start

    start = time.perf_counter()
    for _ in range(500):
        response = await api_client.patch(
            f"/api/v1/orders/{order_id}/position",
            json=PositionUpdateFactory(),
            headers=auth_headers,
        )
        assert response.status_code == 200
    update_elapsed = time.perf_counter() - start

    assert prediction_elapsed < 5.0
    assert update_elapsed < 10.0


@pytest.mark.performance
@pytest.mark.asyncio
async def test_event_throughput_on_redis_channel(test_redis, tenant_id) -> None:
    channel = f"tenant:{tenant_id}:events"
    start = time.perf_counter()
    for index in range(100):
        await test_redis.publish(channel, f'{{"type":"shipment_updated","order_id":"order-{index}"}}')
    elapsed = time.perf_counter() - start
    events_per_second = 100 / elapsed

    assert events_per_second >= 10
