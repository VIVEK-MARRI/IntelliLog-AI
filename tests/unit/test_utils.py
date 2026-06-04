from __future__ import annotations

from src.api.routers.orders import _get_risk_level
from src.api.routers.predictions import _confidence_to_score
from src.db.redis_schema import (
    get_features_key,
    get_fleet_positions_key,
    get_order_state_key,
    get_pubsub_events_channel,
)


def test_redis_schema_helpers_build_expected_keys() -> None:
    assert get_order_state_key("order-1") == "order:state:order-1"
    assert get_fleet_positions_key("tenant-1") == "fleet:tenant-1:positions"
    assert get_features_key("order-1") == "features:order-1"
    assert get_pubsub_events_channel("tenant-1") == "tenant:tenant-1:events"


def test_confidence_and_risk_mappings_are_consistent() -> None:
    assert _confidence_to_score("high") == 0.9
    assert _confidence_to_score("medium") == 0.75
    assert _confidence_to_score("low") == 0.6
    assert _confidence_to_score("unknown") == 0.8

    assert _get_risk_level(0.1).value == "low"
    assert _get_risk_level(0.5).value == "medium"
    assert _get_risk_level(0.9).value == "high"
