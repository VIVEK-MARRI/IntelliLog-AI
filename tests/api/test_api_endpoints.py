from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from tests.fixtures.factories import OrderRequestFactory, PositionUpdateFactory


@pytest.mark.asyncio
async def test_health_endpoints_and_metrics(api_client) -> None:
    response = await api_client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] in {"healthy", "degraded"}
    assert payload["api"] == "ok"
    assert payload["database"] in {"ok", "degraded", "down"}
    assert payload["redis"] in {"ok", "degraded", "down"}

    live = await api_client.get("/health/live")
    assert live.status_code == 200
    assert live.json() == {"status": "alive"}

    ready = await api_client.get("/health/ready")
    assert ready.status_code == 200
    assert ready.json()["status"] in {"ready", "not_ready"}

    metrics = await api_client.get("/metrics")
    assert metrics.status_code == 200
    assert "http_requests_total" in metrics.text


@pytest.mark.asyncio
async def test_create_order_list_orders_and_position_update(api_client, auth_headers, test_redis, tenant_id) -> None:
    order_request = OrderRequestFactory()
    order_request["plannedEta"] = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()

    create_response = await api_client.post("/api/v1/orders", json=order_request, headers=auth_headers)
    assert create_response.status_code == 200, create_response.text
    created = create_response.json()
    order_id = created["orderId"]

    list_response = await api_client.get("/api/v1/orders", headers=auth_headers)
    assert list_response.status_code == 200
    orders = list_response.json()["items"]
    assert any(order.get("orderId", order.get("order_id")) == order_id for order in orders)

    redis_state = await test_redis.hgetall(f"order:{order_id}")
    normalized_state = {
        (key.decode() if isinstance(key, bytes) else key): (
            value.decode() if isinstance(value, bytes) else value
        )
        for key, value in redis_state.items()
    }
    assert normalized_state["driver_id"] == order_request["driver_id"]

    update_payload = PositionUpdateFactory()
    patch_response = await api_client.patch(
        f"/api/v1/orders/{order_id}/position",
        json=update_payload,
        headers=auth_headers,
    )
    assert patch_response.status_code == 200
    assert patch_response.json()["received"] is True

    redis_state_after = await test_redis.hgetall(f"order:{order_id}")
    normalized_after = {
        (key.decode() if isinstance(key, bytes) else key): (
            value.decode() if isinstance(value, bytes) else value
        )
        for key, value in redis_state_after.items()
    }
    assert float(normalized_after["latitude"]) == update_payload["lat"]
    assert float(normalized_after["longitude"]) == update_payload["lng"]


@pytest.mark.asyncio
async def test_get_prediction_uses_cached_order_state(api_client, auth_headers, test_redis) -> None:
    order_id = "order-prediction-1"
    await test_redis.hset(
        f"order:{order_id}",
        mapping={
            "driver_id": "driver-1",
            "tenant_id": "tenant-1",
            "planned_stops": 8,
            "completed_stops": 2,
            "planned_duration_minutes": 240.0,
            "actual_duration_so_far_minutes": 140.0,
            "stops_remaining": 6,
            "eta_minutes_remaining": 60.0,
            "speed": 28.0,
            "deviation_meters": 180.0,
            "driver_on_time_rate": 0.82,
        },
    )

    response = await api_client.get(f"/api/v1/predictions/{order_id}", headers=auth_headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload.get("orderId", payload.get("order_id")) == order_id
    assert 0 <= payload.get("riskScore", payload.get("risk_score")) <= 1
    assert isinstance(payload.get("topRiskFactors", payload.get("top_risk_factors")), list)
    assert payload.get("modelVersion", payload.get("model_version")) == "test-model-1"
