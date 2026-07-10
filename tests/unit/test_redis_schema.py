"""Unit tests for the Redis key/channel schema helpers.

These are pure functions with no external dependencies. They guard against
the class of bug where the frontend and backend disagree on Redis key/namespace
shapes (see audit Tier 1 defect #3 — get_features_key was previously missing).
"""
from src.db.redis_schema import (
    FEATURES_CACHE_KEY_PATTERN,
    get_features_key,
    get_prediction_updates_channel,
    get_pubsub_events_channel,
    get_shipment_updates_channel,
)


def test_get_features_key_formats_order_id():
    assert get_features_key("DEMO-normal-001") == "features:DEMO-normal-001"
    assert FEATURES_CACHE_KEY_PATTERN.format(order_id="X") == "features:X"


def test_get_shipment_updates_channel_is_stable():
    # Required by src/optimization/service.py and tasks.py
    assert get_shipment_updates_channel() == "shipment:updates"


def test_get_prediction_updates_channel_is_stable():
    assert get_prediction_updates_channel() == "predictions:updates"


def test_get_pubsub_events_channel_includes_tenant():
    assert get_pubsub_events_channel("tenant-abc") == "tenant:tenant-abc:events"
