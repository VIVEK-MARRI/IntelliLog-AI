"""
Redis data structures and key patterns for IntelliLog-AI.

This module documents the exact Redis key patterns, data types, and TTLs
used throughout the platform for caching, pub/sub, and real-time features.

All keys are namespaced by tenant for multi-tenant isolation.
"""

from typing import TypedDict, Literal
from dataclasses import dataclass


# ============================================================================
# ORDER HOT STATE (Updated on every GPS ping)
# ============================================================================

class OrderHotStateDict(TypedDict, total=False):
    """Order state dictionary stored in Redis Hash."""
    lat: float
    lng: float
    speed: float
    heading: float
    risk_score: float
    eta_minutes_remaining: float
    stops_remaining: int
    last_ping_at: str  # ISO format timestamp
    deviation_meters: float


ORDER_STATE_KEY_PATTERN = "order:state:{order_id}"
"""
Pattern: order:state:{order_id}
Type: Redis Hash
TTL: 4 hours (auto-expire completed orders)

Fields stored:
- lat: Current latitude
- lng: Current longitude
- speed: Current speed in km/h
- heading: Heading in degrees (0-360)
- risk_score: Current delay risk score (0.0-1.0)
- eta_minutes_remaining: Estimated minutes until delivery
- stops_remaining: Number of unvisited stops
- last_ping_at: ISO timestamp of last GPS update
- deviation_meters: Distance deviated from planned route

Example key: order:state:550e8400-e29b-41d4-a716-446655440000
"""

ORDER_STATE_TTL_SECONDS = 4 * 3600  # 4 hours


# ============================================================================
# DRIVER POSITION INDEX (Fleet map for real-time dashboards)
# ============================================================================

class DriverPositionMember(TypedDict):
    """Member data for fleet position index."""
    driver_id: str
    order_id: str
    lat: float
    lng: float
    risk_score: float


FLEET_POSITIONS_KEY_PATTERN = "fleet:{tenant_id}:positions"
"""
Pattern: fleet:{tenant_id}:positions
Type: Redis Sorted Set (score = Unix timestamp)
TTL: 30 minutes

Sorted set member: JSON string {driver_id, lat, lng, order_id, risk_score}
Score: Unix timestamp (seconds since epoch)

Used for:
- Real-time fleet map display on dispatcher dashboard
- Quick spatial queries of active drivers
- Geofencing alerts

Score ordering ensures old positions are easily pruned.

Example key: fleet:550e8400-e29b-41d4-a716-446655440000:positions
Example member: {"driver_id": "d1", "order_id": "o1", "lat": 17.385, "lng": 78.487, "risk_score": 0.35}
Example score: 1685283600 (Unix timestamp)
"""

FLEET_POSITIONS_TTL_SECONDS = 30 * 60  # 30 minutes


# ============================================================================
# FEATURE CACHE (ML model features, pre-computed every 30 seconds)
# ============================================================================

class FeatureCacheDict(TypedDict, total=False):
    """Feature cache dictionary stored in Redis Hash."""
    distance_remaining_km: float
    time_remaining_minutes: float
    stops_remaining: int
    current_speed_kmh: float
    avg_speed_kmh: float
    max_speed_recent_kmh: float
    acceleration_kmh_per_min: float
    traffic_ahead_probability: float
    driver_on_time_rate: float
    hour_of_day: int
    day_of_week: int
    weather_condition: str
    vehicle_type: str
    route_complexity: float


FEATURES_CACHE_KEY_PATTERN = "features:{order_id}"


def get_features_key(order_id: str) -> str:
    """Return the Redis key for an order's pre-computed ML features."""
    return FEATURES_CACHE_KEY_PATTERN.format(order_id=order_id)
"""
Pattern: features:{order_id}
Type: Redis Hash
TTL: 5 minutes (model inference features are frequently recomputed)

Pre-computed feature values for ML model:
- distance_remaining_km: Distance to final stop (km)
- time_remaining_minutes: Planned time to final stop
- stops_remaining: Stops not yet visited
- current_speed_kmh: Last reported speed
- avg_speed_kmh: Average speed on current delivery
- max_speed_recent_kmh: Max speed in last 5 minutes
- acceleration_kmh_per_min: Rate of speed change (positive=accelerating)
- traffic_ahead_probability: Predicted traffic likelihood
- driver_on_time_rate: Historical on-time performance (0.0-1.0)
- hour_of_day: Hour when delivery started (0-23)
- day_of_week: Day of week (0=Monday, 6=Sunday)
- weather_condition: 'clear', 'rain', 'heavy_rain'
- vehicle_type: e.g., 'motorcycle', 'car', 'van'
- route_complexity: Number of turns / complexity score

Used by: XGBoost model for delay prediction
Updated: Every GPS ping (or at most every 30 seconds)

Example key: features:550e8400-e29b-41d4-a716-446655440000
"""

FEATURES_CACHE_TTL_SECONDS = 5 * 60  # 5 minutes


# ============================================================================
# DECISION CACHE (Latest agent decision for an order)
# ============================================================================

class DecisionCacheDict(TypedDict, total=False):
    """Latest decision cache for an order."""
    decision: str  # 'no_action', 'alert_customer', 'reroute', 'escalate'
    risk_score: float
    decided_at: str  # ISO timestamp
    model_version: str


DECISION_CACHE_KEY_PATTERN = "decision:{order_id}"
"""
Pattern: decision:{order_id}
Type: Redis Hash
TTL: 2 minutes

Stores the most recent agent decision and metadata:
- decision: Type of action taken
- risk_score: Risk score that triggered decision
- decided_at: ISO timestamp when decision was made
- model_version: Version of model that made decision

Used for:
- Quick lookup of current order status
- Audit trail in real-time dashboard
- Prevent duplicate decisions on the same risk event

Example key: decision:550e8400-e29b-41d4-a716-446655440000
"""

DECISION_CACHE_TTL_SECONDS = 2 * 60  # 2 minutes


# ============================================================================
# PUB/SUB CHANNELS (WebSocket Broadcasting)
# ============================================================================

TENANT_EVENTS_CHANNEL_PATTERN = "tenant:{tenant_id}:events"
"""
Channel pattern: tenant:{tenant_id}:events

Used for broadcasting events to all WebSocket clients for a tenant.

Message format (JSON):
{
  "type": "order_update" | "agent_decision" | "driver_location" | "alert",
  "order_id": str,
  "payload": {...}
}

Event types:
- order_update: Order status changed
- agent_decision: Agent made a decision (alert, reroute, etc.)
- driver_location: Driver location updated
- alert: High-priority alert for dispatcher

Example channel: tenant:550e8400-e29b-41d4-a716-446655440000:events

Subscribers: WebSocket connections for that tenant's dashboard
Publishers: API backend on every GPS ping / decision
"""

ORDER_EVENTS_CHANNEL_PATTERN = "order:{order_id}:events"
"""
Channel pattern: order:{order_id}:events

Used for broadcasting order-specific events.

Message format (JSON):
{
  "type": "status_change" | "risk_update" | "gps_ping",
  "timestamp": ISO timestamp,
  "payload": {...}
}

Subscribers: Dashboards/monitoring systems for that specific order
Publishers: Order processing backend
"""


# ============================================================================
# RATE LIMITING (Token bucket for API rate limiting)
# ============================================================================

RATE_LIMIT_KEY_PATTERN = "ratelimit:{tenant_id}:{endpoint}"
"""
Pattern: ratelimit:{tenant_id}:{endpoint}
Type: Redis String (counter) with TTL
TTL: 60 seconds (sliding window)

Stores request count for rate limiting.

Example key: ratelimit:550e8400-e29b-41d4-a716-446655440000:gps_ping
Example value: 42

Used with: INCR command + TTL expiry
Reference: Token bucket algorithm
"""

RATE_LIMIT_TTL_SECONDS = 60


# ============================================================================
# DRIVER SESSION CACHE
# ============================================================================

DRIVER_SESSION_KEY_PATTERN = "driver:session:{driver_id}"
"""
Pattern: driver:session:{driver_id}
Type: Redis Hash
TTL: 8 hours (typical delivery shift)

Stores driver session info:
- session_id: UUID of current session
- current_order_id: Order being delivered
- tenant_id: Tenant this driver belongs to
- last_heartbeat: Last GPS ping timestamp
- total_stops_today: Cumulative stops delivered today

Example key: driver:session:d550e8400-e29b-41d4-a716-446655440001
"""

DRIVER_SESSION_TTL_SECONDS = 8 * 3600


# ============================================================================
# DEPENDENCY TRACKING (For feature cache invalidation)
# ============================================================================

ORDER_DEPENDENCIES_KEY_PATTERN = "deps:{order_id}"
"""
Pattern: deps:{order_id}
Type: Redis Set
TTL: 5 minutes

Tracks which cached features depend on this order.
When an order updates, all dependent caches are invalidated.

Example key: deps:550e8400-e29b-41d4-a716-446655440000
Example members: ['features:550e8400-e29b-41d4-a716-446655440000', 
                  'decision:550e8400-e29b-41d4-a716-446655440000']
"""


# ============================================================================
# SUMMARY OF ALL KEY PATTERNS AND TTLs
# ============================================================================

@dataclass
class RedisKeyPattern:
    """Documentation for a Redis key pattern."""
    pattern: str
    key_type: Literal["hash", "zset", "set", "string", "list"]
    ttl_seconds: int
    description: str
    example_key: str
    multi_tenant: bool


REDIS_KEY_PATTERNS = [
    RedisKeyPattern(
        pattern=ORDER_STATE_KEY_PATTERN,
        key_type="hash",
        ttl_seconds=ORDER_STATE_TTL_SECONDS,
        description="Current order state (position, speed, risk, ETA)",
        example_key="order:state:550e8400-e29b-41d4-a716-446655440000",
        multi_tenant=True,
    ),
    RedisKeyPattern(
        pattern=FLEET_POSITIONS_KEY_PATTERN,
        key_type="zset",
        ttl_seconds=FLEET_POSITIONS_TTL_SECONDS,
        description="Real-time driver positions for fleet map (sorted by timestamp)",
        example_key="fleet:550e8400-e29b-41d4-a716-446655440000:positions",
        multi_tenant=True,
    ),
    RedisKeyPattern(
        pattern=FEATURES_CACHE_KEY_PATTERN,
        key_type="hash",
        ttl_seconds=FEATURES_CACHE_TTL_SECONDS,
        description="Pre-computed ML model features for delay prediction",
        example_key="features:550e8400-e29b-41d4-a716-446655440000",
        multi_tenant=True,
    ),
    RedisKeyPattern(
        pattern=DECISION_CACHE_KEY_PATTERN,
        key_type="hash",
        ttl_seconds=DECISION_CACHE_TTL_SECONDS,
        description="Latest agent decision and metadata for an order",
        example_key="decision:550e8400-e29b-41d4-a716-446655440000",
        multi_tenant=True,
    ),
    RedisKeyPattern(
        pattern=DRIVER_SESSION_KEY_PATTERN,
        key_type="hash",
        ttl_seconds=DRIVER_SESSION_TTL_SECONDS,
        description="Driver active session information",
        example_key="driver:session:d550e8400-e29b-41d4-a716-446655440001",
        multi_tenant=True,
    ),
    RedisKeyPattern(
        pattern=ORDER_DEPENDENCIES_KEY_PATTERN,
        key_type="set",
        ttl_seconds=5 * 60,
        description="Tracking dependencies for cache invalidation",
        example_key="deps:550e8400-e29b-41d4-a716-446655440000",
        multi_tenant=True,
    ),
]


def get_redis_key(pattern: str, **kwargs) -> str:
    """
    Generate a Redis key from a pattern.
    
    Args:
        pattern: Key pattern with {variable} placeholders
        **kwargs: Values for placeholders
        
    Returns:
        Formatted Redis key
        
    Example:
        >>> get_redis_key(ORDER_STATE_KEY_PATTERN, order_id="123")
        'order:state:123'
    """
    return pattern.format(**kwargs)


def get_shipment_updates_channel() -> str:
    """Return the pub/sub channel name for shipment/route updates."""
    return "shipment:updates"


def get_features_key(order_id: str) -> str:
    """
    Return the Redis key for the ML feature cache for a given order.

    Pattern: features:{order_id}
    TTL: FEATURES_CACHE_TTL_SECONDS (5 minutes)

    Example:
        >>> get_features_key("550e8400-e29b-41d4-a716-446655440000")
        'features:550e8400-e29b-41d4-a716-446655440000'
    """
    return FEATURES_CACHE_KEY_PATTERN.format(order_id=order_id)


def get_order_state_key(order_id: str) -> str:
    """
    Return the Redis key for the live order state hash.

    Pattern: order:{order_id}
    (Note: ORDER_STATE_KEY_PATTERN documents 'order:state:{order_id}' but the
    actual codebase consistently uses 'order:{order_id}'. This helper matches
    the actual usage — see orders.py, predictions.py, routes.py.)

    Example:
        >>> get_order_state_key("order-1")
        'order:order-1'
    """
    return f"order:{order_id}"


def get_fleet_positions_key(tenant_id: str) -> str:
    """
    Return the Redis key for the fleet positions sorted set for a tenant.

    Pattern: fleet:{tenant_id}:positions
    TTL: FLEET_POSITIONS_TTL_SECONDS (30 minutes)

    Example:
        >>> get_fleet_positions_key("tenant-1")
        'fleet:tenant-1:positions'
    """
    return FLEET_POSITIONS_KEY_PATTERN.format(tenant_id=tenant_id)


def get_prediction_updates_channel() -> str:
    """Return the pub/sub channel name for prediction updates."""
    return "predictions:updates"


def get_pubsub_events_channel(tenant_id: str) -> str:
    """Return the pub/sub channel name for a tenant's events."""
    return TENANT_EVENTS_CHANNEL_PATTERN.format(tenant_id=tenant_id)


def get_agent_updates_channel() -> str:
    """
    Return the pub/sub channel name for agent decision updates.

    Used by agent tools to broadcast decisions (reroute, alert, no-action)
    to any subscriber interested in agent activity across all tenants.
    Tenant-specific events are also published separately to the tenant channel.

    Example:
        >>> get_agent_updates_channel()
        'agent:updates'
    """
    return "agent:updates"


# ============================================================================
# REDIS CONNECTION & HEALTH CHECKS
# ============================================================================

REDIS_HEALTH_CHECK_KEY = "health:check"
"""
Simple health check key. Used to verify Redis is responding.
Set to current timestamp, TTL: 60 seconds.
"""

REDIS_TASK_QUEUE_KEY = "tasks:queue"
"""
Queue for background tasks (expired orders cleanup, feature computation, etc.)
Type: Redis List (FIFO)
"""

REDIS_TASK_QUEUE_PROCESSING_KEY = "tasks:processing"
"""
Set of tasks currently being processed (for at-least-once delivery).
Type: Redis Set
"""


# ============================================================================
# MEMORY OPTIMIZATION NOTES
# ============================================================================

"""
Redis Memory Optimization Strategy:

1. KEY EXPIRATION:
   - All keys have explicit TTL to prevent unbounded memory growth
   - Configure eviction policy: 'allkeys-lru' as fallback
   
2. VALUE COMPRESSION:
   - Store JSON as strings (Redis handles efficiently)
   - Use GZIP compression for large feature vectors (if needed)
   
3. PARTITIONING (for large deployments):
   - Use Redis Cluster or Sentinel for sharding
   - Shard by {tenant_id} + consistent hashing for {order_id}
   
4. MONITORING:
   - Track memory usage per key prefix
   - Alert if any single key grows > 1MB
   - Archive old decision history to TimescaleDB periodically
   
5. BATCH OPERATIONS:
   - Use PIPELINE for multiple commands
   - Use SCAN instead of KEYS for production systems
"""
