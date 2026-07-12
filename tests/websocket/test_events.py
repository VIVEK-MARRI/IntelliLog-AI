from __future__ import annotations

import asyncio
import json

import fakeredis.aioredis
import pytest
from fastapi.testclient import TestClient

from tests.conftest import StubPredictionService
from src.api.main import app
from src.api.routers import websocket as websocket_router
import src.api.main as main_module

# In dev-bypass mode the authenticated tenant is always "dev-tenant-id".
# Tests that publish to a channel to verify delivery must use this constant.
DEV_TENANT_ID = "dev-tenant-id"


class StartupPredictionService(StubPredictionService):
    def __init__(self, model_dir: str = "models/") -> None:
        super().__init__()


def _patched_redis_client(fake_redis):
    async def _from_url(*args, **kwargs):
        return fake_redis

    return _from_url


@pytest.fixture
def websocket_client(monkeypatch):
    fake_redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(websocket_router.redis, "from_url", _patched_redis_client(fake_redis))
    monkeypatch.setattr(main_module, "PredictionService", StartupPredictionService)
    with TestClient(app) as client:
        yield client, fake_redis


@pytest.mark.websocket
def test_websocket_connection_and_ping_pong(websocket_client) -> None:
    client, _ = websocket_client

    with client.websocket_connect("/ws") as websocket:
        initial = websocket.receive_json()
        assert initial["type"] == "initial_state"
        websocket.send_json({"type": "ping"})
        assert websocket.receive_json()["type"] == "pong"


@pytest.mark.websocket
def test_websocket_broadcast_and_tenant_isolation(websocket_client) -> None:
    client, _ = websocket_client
    tenant_a = "tenant-a"
    tenant_b = "tenant-b"

    class DummySocket:
        def __init__(self) -> None:
            self.messages = []

        async def send_json(self, payload):
            self.messages.append(payload)

    socket_a = DummySocket()
    socket_b = DummySocket()
    websocket_router.active_connections[tenant_a] = {socket_a}
    websocket_router.active_connections[tenant_b] = {socket_b}

    asyncio.run(websocket_router.broadcast_to_tenant(tenant_a, {"type": "prediction_updated", "order_id": "order-1"}))

    assert socket_a.messages == [{"type": "prediction_updated", "order_id": "order-1"}]
    assert socket_b.messages == []


@pytest.mark.websocket
def test_websocket_receives_tenant_channel_events(websocket_client) -> None:
    client, fake_redis = websocket_client
    # Dev-bypass always authenticates as DEV_TENANT_ID; publish to that channel.
    channel = f"tenant:{DEV_TENANT_ID}:events"

    with client.websocket_connect("/ws") as websocket:
        websocket.receive_json()  # consume initial_state
        asyncio.run(fake_redis.publish(channel, json.dumps({"type": "shipment_updated", "order_id": "order-1"})))
        message = websocket.receive_json()
        assert message["type"] == "shipment_updated"
        assert message["order_id"] == "order-1"


@pytest.mark.websocket
def test_websocket_reconnects_and_receives_event_types(websocket_client) -> None:
    client, fake_redis = websocket_client
    channel = f"tenant:{DEV_TENANT_ID}:events"

    with client.websocket_connect("/ws") as websocket:
        websocket.receive_json()  # consume initial_state

    with client.websocket_connect("/ws") as websocket:
        websocket.receive_json()  # consume initial_state
        for event_type in ["prediction_updated", "agent_updated", "route_updated", "shipment_updated"]:
            asyncio.run(fake_redis.publish(channel, json.dumps({"type": event_type, "order_id": "order-1"})))
            message = websocket.receive_json()
            assert message["type"] == event_type
