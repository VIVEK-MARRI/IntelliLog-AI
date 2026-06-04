from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from tests.fixtures.factories import OrderRequestFactory


async def _create_order(api_client, headers, eta_offset_hours: int) -> dict:
    order_request = OrderRequestFactory()
    order_request["plannedEta"] = (
        datetime.now(timezone.utc) + timedelta(hours=eta_offset_hours)
    ).isoformat()
    response = await api_client.post("/api/v1/orders", json=order_request, headers=headers)
    assert response.status_code == 200
    return order_request


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_high_risk_delivery_flow(api_client, auth_headers, test_redis) -> None:
    order_request = await _create_order(api_client, auth_headers, 2)
    await test_redis.hset(
        f"order:{order_request['orderId']}",
        mapping={
            "driver_id": order_request["driverId"],
            "planned_stops": 8,
            "completed_stops": 1,
            "planned_duration_minutes": 240.0,
            "actual_duration_so_far_minutes": 220.0,
            "stops_remaining": 7,
            "eta_minutes_remaining": 15.0,
            "speed": 18.0,
            "deviation_meters": 500.0,
            "driver_on_time_rate": 0.7,
        },
    )
    response = await api_client.get(f"/api/v1/predictions/{order_request['orderId']}", headers=auth_headers)
    assert response.status_code == 200
    prediction_payload = response.json()
    assert prediction_payload.get("riskScore", prediction_payload.get("risk_score")) >= 0


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_low_risk_delivery_flow(api_client, auth_headers, test_redis) -> None:
    order_request = await _create_order(api_client, auth_headers, 3)
    await test_redis.hset(
        f"order:{order_request['orderId']}",
        mapping={
            "driver_id": order_request["driverId"],
            "planned_stops": 6,
            "completed_stops": 5,
            "planned_duration_minutes": 120.0,
            "actual_duration_so_far_minutes": 40.0,
            "stops_remaining": 1,
            "eta_minutes_remaining": 10.0,
            "speed": 40.0,
            "deviation_meters": 20.0,
            "driver_on_time_rate": 0.95,
        },
    )
    response = await api_client.get(f"/api/v1/predictions/{order_request['orderId']}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["confidence"] >= 0.6


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_delayed_shipment_flow(api_client, auth_headers, test_redis) -> None:
    order_request = await _create_order(api_client, auth_headers, 1)
    response = await api_client.patch(
        f"/api/v1/orders/{order_request['orderId']}/position",
        json={"lat": 40.75, "lng": -74.1, "speed_kmh": 12.0, "heading": 90.0},
        headers=auth_headers,
    )
    assert response.status_code == 200
