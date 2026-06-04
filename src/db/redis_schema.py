"""
Redis data structure schemas for IntelliLog-AI.

Defines the exact key patterns, data types, and TTLs for Redis caching layer.
Used for real-time state, fleet tracking, feature caching, and pub/sub events.
"""

from dataclasses import dataclass
from typing import Literal

# ============================================================================
# Order Hot State
# ============================================================================

# Pattern: order:state:{order_id}
# Type: Redis Hash
# Purpose: Current real-time state of an active delivery order
# TTL: 4 hours (auto-expire completed orders)
# Updated: On every GPS ping
#
# Fields:
#   - lat (FLOAT): Current latitude
#   - lng (FLOAT): Current longitude
#   - speed (FLOAT): Current speed in km/h
#   - heading (FLOAT): Current heading in degrees
#   - risk_score (FLOAT): Latest ML model prediction (0.0-1.0)
#   - eta_minutes_remaining (INT): Estimated minutes until delivery
#   - stops_remaining (INT): Number of stops not yet visited
#   - last_ping_at (INT): Unix timestamp of last GPS ping
#   - deviation_meters (FLOAT): Deviation from planned route
#   - status (STRING): Order status
#
# Example:
#   HSET order:state:550e8400-e29b-41d4-a716-446655440000 \
#     lat 40.7128 \
#     lng -74.0060 \
#     speed 45.2 \
#     heading 125.5 \
#     risk_score 0.68 \
#     eta_minutes_remaining 23 \
#     stops_remaining 3 \
#     last_ping_at 1704067200 \
#     deviation_meters 250.5 \
#     status "in_progress"
#
# TTL: EXPIRE order:state:{order_id} 14400 (4 hours)

ORDER_STATE_KEY_PATTERN = "order:state:{order_id}"
ORDER_STATE_TTL_SECONDS = 4 * 60 * 60  # 4 hours
ORDER_STATE_FIELDS = {
    "lat": "FLOAT - Current latitude",
    "lng": "FLOAT - Current longitude", 
    "speed": "FLOAT - Current speed km/h",
    "heading": "FLOAT - Heading in degrees",
    "risk_score": "FLOAT - ML risk prediction (0.0-1.0)",
    "eta_minutes_remaining": "INT - Minutes until delivery",
    "stops_remaining": "INT - Unvisited stops",
    "last_ping_at": "INT - Unix timestamp of last ping",
    "deviation_meters": "FLOAT - Route deviation in meters",
    "status": "STRING - Order status (pending, assigned, in_progress, completed, failed)"
}

# ============================================================================
# Fleet Position Index
# ============================================================================

# Pattern: fleet:{tenant_id}:positions
# Type: Redis Sorted Set (ZSET)
# Purpose: Real-time position of all active drivers for fleet map
# TTL: 30 minutes (expires old positions)
# Score: Unix timestamp (for age-based expiry)
# Member: JSON string with driver info
#
# Member JSON schema:
#   {
#     "driver_id": "UUID",
#     "lat": float,
#     "lng": float,
#     "order_id": "UUID or null",
#     "risk_score": float (0.0-1.0),
#     "speed_kmh": float,
#     "status": "idle" | "assigned" | "in_delivery" | "offline"
#   }
#
# Example:
#   ZADD fleet:550e8400-e29b-41d4-a716-446655440000:positions \
#     1704067200 '{"driver_id":"driver-123","lat":40.7128,"lng":-74.0060,"order_id":"order-456","risk_score":0.68,"speed_kmh":45.2,"status":"in_delivery"}'
#
# TTL: EXPIRE fleet:{tenant_id}:positions 1800 (30 minutes)
# Cleanup: Remove stale entries older than 30 minutes via background task

FLEET_POSITIONS_KEY_PATTERN = "fleet:{tenant_id}:positions"
FLEET_POSITIONS_TTL_SECONDS = 30 * 60  # 30 minutes
FLEET_POSITION_JSON_FIELDS = {
    "driver_id": "UUID of driver",
    "lat": "Current latitude",
    "lng": "Current longitude",
    "order_id": "UUID of current order or null",
    "risk_score": "ML delay risk (0.0-1.0)",
    "speed_kmh": "Current speed km/h",
    "status": "Driver status (idle, assigned, in_delivery, offline)"
}

# ============================================================================
# Feature Cache
# ============================================================================

# Pattern: features:{order_id}
# Type: Redis Hash
# Purpose: Pre-computed ML model features, cached to avoid recalculation
# TTL: 5 minutes (features are short-lived; recalculated frequently)
# Updated: After every GPS ping; contains 14 model features
#
# Fields (matching XGBoost feature set from Prompt 2):
#   - distance_remaining_km (FLOAT): Remaining distance to deliver
#   - time_remaining_minutes (FLOAT): Planned time remaining
#   - current_speed_kmh (FLOAT): Current speed
#   - avg_speed_last_10_pings (FLOAT): Rolling avg speed
#   - stops_remaining (INT): Unvisited stops
#   - time_per_stop_minutes (FLOAT): Average stop duration
#   - hour_of_day (INT): Current hour
#   - day_of_week (INT): 0=Monday, 6=Sunday
#   - traffic_events_on_route (INT): Predicted traffic events ahead
#   - weather_condition (STRING): "clear", "rain", or "heavy_rain"
#   - driver_on_time_rate (FLOAT): Driver's historical OTR
#   - is_first_delivery (INT): 1 if first delivery of day, 0 otherwise
#   - cumulative_delay_minutes (FLOAT): Total delay accumulated so far
#   - route_complexity_score (FLOAT): Complexity metric (0.0-1.0)
#
# Example:
#   HSET features:order-550e8400 \
#     distance_remaining_km 12.5 \
#     time_remaining_minutes 18 \
#     current_speed_kmh 45.2 \
#     avg_speed_last_10_pings 42.8 \
#     stops_remaining 3 \
#     time_per_stop_minutes 5.2 \
#     hour_of_day 14 \
#     day_of_week 2 \
#     traffic_events_on_route 1 \
#     weather_condition "clear" \
#     driver_on_time_rate 0.87 \
#     is_first_delivery 0 \
#     cumulative_delay_minutes -2.5 \
#     route_complexity_score 0.65
#
# TTL: EXPIRE features:{order_id} 300 (5 minutes)

FEATURES_KEY_PATTERN = "features:{order_id}"
FEATURES_TTL_SECONDS = 5 * 60  # 5 minutes
FEATURES_FIELDS = {
    "distance_remaining_km": "FLOAT - Remaining distance",
    "time_remaining_minutes": "FLOAT - Planned time remaining",
    "current_speed_kmh": "FLOAT - Current speed",
    "avg_speed_last_10_pings": "FLOAT - Rolling average",
    "stops_remaining": "INT - Unvisited stops",
    "time_per_stop_minutes": "FLOAT - Avg stop duration",
    "hour_of_day": "INT - Current hour (0-23)",
    "day_of_week": "INT - Day (0=Monday, 6=Sunday)",
    "traffic_events_on_route": "INT - Predicted events",
    "weather_condition": "STRING - clear|rain|heavy_rain",
    "driver_on_time_rate": "FLOAT - Historical OTR",
    "is_first_delivery": "INT - 1 if first, 0 otherwise",
    "cumulative_delay_minutes": "FLOAT - Accumulated delay",
    "route_complexity_score": "FLOAT - Complexity (0.0-1.0)"
}

# ============================================================================
# Pub/Sub Channels for WebSocket Broadcasting
# ============================================================================

# Canonical operational channels used by the backend.
SHIPMENT_UPDATES_CHANNEL = "shipment_updates"
PREDICTION_UPDATES_CHANNEL = "prediction_updates"
AGENT_UPDATES_CHANNEL = "agent_updates"

# Pattern: tenant:{tenant_id}:events
# Type: Pub/Sub Channel
# Purpose: Broadcast real-time events to WebSocket clients
# Message Format: JSON string
#
# Message JSON schema:
#   {
#     "type": "gps_update" | "risk_alert" | "agent_action" | "delivery_completed",
#     "order_id": "UUID",
#     "timestamp": "ISO 8601 datetime",
#     "payload": {...event-specific data...}
#   }
#
# Example GPS Update:
#   {
#     "type": "gps_update",
#     "order_id": "order-550e8400",
#     "timestamp": "2024-01-01T12:00:00Z",
#     "payload": {
#       "lat": 40.7128,
#       "lng": -74.0060,
#       "speed_kmh": 45.2,
#       "heading_degrees": 125.5,
#       "eta_minutes_remaining": 23
#     }
#   }
#
# Example Risk Alert:
#   {
#     "type": "risk_alert",
#     "order_id": "order-550e8400",
#     "timestamp": "2024-01-01T12:00:00Z",
#     "payload": {
#       "risk_score": 0.92,
#       "threshold": 0.80,
#       "primary_factors": ["traffic_ahead", "driver_speed_slow"],
#       "recommended_action": "alert_customer"
#     }
#   }
#
# Example Agent Action:
#   {
#     "type": "agent_action",
#     "order_id": "order-550e8400",
#     "timestamp": "2024-01-01T12:00:00Z",
#     "payload": {
#       "action": "alert_customer",
#       "decision_id": "decision-uuid",
#       "reasoning": {
#         "risk_score": 0.92,
#         "feature_importance": {...},
#         "model_version": "v1.2.0"
#       }
#     }
#   }
#
# USAGE: PUBLISH tenant:{tenant_id}:events "{message_json}"

PUBSUB_EVENTS_KEY_PATTERN = "tenant:{tenant_id}:events"
PUBSUB_MESSAGE_TYPES = {
    "gps_update": "New GPS ping received",
    "risk_alert": "Risk score crossed threshold",
    "agent_action": "Agent took an action",
    "delivery_completed": "Delivery finished"
}

# ============================================================================
# Data Class References for Type Safety
# ============================================================================

@dataclass
class OrderState:
    """In-memory representation of order:state:{order_id}."""
    lat: float
    lng: float
    speed: float
    heading: float
    risk_score: float
    eta_minutes_remaining: int
    stops_remaining: int
    last_ping_at: int
    deviation_meters: float
    status: Literal["pending", "assigned", "in_progress", "completed", "failed"]


@dataclass
class FleetPosition:
    """In-memory representation of fleet position in sorted set."""
    driver_id: str
    lat: float
    lng: float
    order_id: str | None
    risk_score: float
    speed_kmh: float
    status: Literal["idle", "assigned", "in_delivery", "offline"]


@dataclass
class ModelFeatures:
    """In-memory representation of features:{order_id}."""
    distance_remaining_km: float
    time_remaining_minutes: float
    current_speed_kmh: float
    avg_speed_last_10_pings: float
    stops_remaining: int
    time_per_stop_minutes: float
    hour_of_day: int
    day_of_week: int
    traffic_events_on_route: int
    weather_condition: Literal["clear", "rain", "heavy_rain"]
    driver_on_time_rate: float
    is_first_delivery: int
    cumulative_delay_minutes: float
    route_complexity_score: float


# ============================================================================
# Python Helper Functions for Redis Clients
# ============================================================================

def get_order_state_key(order_id: str) -> str:
    """Get Redis key for order state."""
    return f"order:state:{order_id}"


def get_fleet_positions_key(tenant_id: str) -> str:
    """Get Redis key for fleet positions."""
    return f"fleet:{tenant_id}:positions"


def get_features_key(order_id: str) -> str:
    """Get Redis key for model features."""
    return f"features:{order_id}"


def get_pubsub_events_channel(tenant_id: str) -> str:
    """Get Pub/Sub channel for tenant events."""
    return f"tenant:{tenant_id}:events"


def get_shipment_updates_channel() -> str:
    """Get the shipment update pub/sub channel."""
    return SHIPMENT_UPDATES_CHANNEL


def get_prediction_updates_channel() -> str:
    """Get the prediction update pub/sub channel."""
    return PREDICTION_UPDATES_CHANNEL


def get_agent_updates_channel() -> str:
    """Get the agent update pub/sub channel."""
    return AGENT_UPDATES_CHANNEL
