from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from src.agent.state import OrderAgentState, StateManager


@pytest.mark.asyncio
async def test_save_load_and_delete_state(binary_test_redis) -> None:
    manager = StateManager(binary_test_redis)
    now = datetime.now(timezone.utc)
    state = OrderAgentState(
        order_id="order-1",
        driver_id="driver-1",
        tenant_id="tenant-a",
        current_lat=40.71,
        current_lng=-74.0,
        current_speed_kmh=33.0,
        heading_degrees=120.0,
        last_ping_at=now,
        planned_stops=8,
        completed_stops=3,
        planned_eta=now + timedelta(hours=2),
        current_eta=now + timedelta(hours=2, minutes=10),
    )

    await manager.save(state, ttl_hours=1)
    loaded = await manager.load("order-1")

    assert loaded is not None
    assert loaded.order_id == state.order_id
    assert loaded.tenant_id == state.tenant_id
    assert loaded.current_speed_kmh == state.current_speed_kmh

    await manager.delete("order-1")
    assert await manager.load("order-1") is None


@pytest.mark.asyncio
async def test_active_orders_are_filtered_by_tenant(test_redis) -> None:
    manager = StateManager(test_redis)
    now = datetime.now(timezone.utc)

    await manager.save(
        OrderAgentState(
            order_id="order-a",
            driver_id="driver-a",
            tenant_id="tenant-a",
            current_lat=40.71,
            current_lng=-74.0,
            current_speed_kmh=30.0,
            last_ping_at=now,
            planned_stops=5,
            completed_stops=1,
            planned_eta=now + timedelta(hours=1),
            current_eta=now + timedelta(hours=1),
        )
    )
    await manager.save(
        OrderAgentState(
            order_id="order-b",
            driver_id="driver-b",
            tenant_id="tenant-b",
            current_lat=40.72,
            current_lng=-74.1,
            current_speed_kmh=31.0,
            last_ping_at=now,
            planned_stops=5,
            completed_stops=1,
            planned_eta=now + timedelta(hours=1),
            current_eta=now + timedelta(hours=1),
        )
    )

    assert await manager.get_active_orders_for_tenant("tenant-a") == ["order-a"]
    assert await manager.get_active_orders_for_tenant("tenant-b") == ["order-b"]
