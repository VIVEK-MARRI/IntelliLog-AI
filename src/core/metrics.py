"""
Prometheus metrics for IntelliLog-AI.
All application metrics defined in one place.
"""

from prometheus_client import Counter, Gauge, Histogram, Info, generate_latest

# ============================================================================
# API METRICS
# ============================================================================

http_requests_total = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "path", "status_code"],
)

http_request_duration_seconds = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "path"],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5],
)

http_requests_in_progress = Gauge(
    "http_requests_in_progress",
    "HTTP requests currently being processed",
    ["method"],
)

# ============================================================================
# AGENT METRICS
# ============================================================================

agent_decisions_total = Counter(
    "agent_decisions_total",
    "Total agent decisions by type",
    ["decision_type", "tenant_id"],  # decision_type: no_action, alert, reroute
)

agent_graph_duration_seconds = Histogram(
    "agent_graph_duration_seconds",
    "Full agent graph execution time in seconds",
    ["tenant_id"],
    buckets=[0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0],
)

agent_node_duration_seconds = Histogram(
    "agent_node_duration_seconds",
    "Individual agent node execution time",
    ["node_name"],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
)

agent_tool_invocations_total = Counter(
    "agent_tool_invocations_total",
    "Total agent tool invocations",
    ["tool_name", "outcome"],  # outcome: success, failure
)

active_high_risk_orders = Gauge(
    "active_high_risk_orders",
    "Currently active orders with risk_score > 0.70",
    ["tenant_id"],
)

agent_processing_errors_total = Counter(
    "agent_processing_errors_total",
    "Agent processing errors",
    ["error_type", "tenant_id"],
)

# ============================================================================
# ML MODEL METRICS
# ============================================================================

prediction_risk_score = Histogram(
    "prediction_risk_score",
    "Distribution of risk scores from predictions",
    ["tenant_id"],
    buckets=[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
)

prediction_latency_seconds = Histogram(
    "prediction_latency_seconds",
    "ML inference latency in seconds",
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25],
)

model_predictions_total = Counter(
    "model_predictions_total",
    "Total ML predictions made",
)

model_cache_hits_total = Counter(
    "model_cache_hits_total",
    "ML prediction cache hits",
)

model_cache_misses_total = Counter(
    "model_cache_misses_total",
    "ML prediction cache misses",
)

model_accuracy_score = Gauge(
    "model_accuracy_score",
    "Current model accuracy (F1 score)",
)

average_risk_score = Gauge(
    "average_risk_score",
    "Average risk score across all active orders",
    ["tenant_id"],
)

# ============================================================================
# ROUTE OPTIMIZATION METRICS
# ============================================================================

route_optimization_duration_seconds = Histogram(
    "route_optimization_duration_seconds",
    "VRP solver execution time in seconds",
    buckets=[0.1, 0.25, 0.5, 1.0, 2.0, 5.0],
)

route_optimization_status_total = Counter(
    "route_optimization_status_total",
    "Route optimization outcomes",
    ["status"],  # optimal, feasible, timeout, infeasible
)

route_optimization_time_saved_minutes = Histogram(
    "route_optimization_time_saved_minutes",
    "Minutes saved by route optimization",
    buckets=[0, 1, 2, 5, 10, 15, 30, 60],
)

optimization_queue_depth = Gauge(
    "optimization_queue_depth",
    "Number of pending optimization jobs in queue",
)

optimization_active_workers = Gauge(
    "optimization_active_workers",
    "Number of active Celery workers processing optimization",
)

# ============================================================================
# REDIS METRICS
# ============================================================================

redis_operations_total = Counter(
    "redis_operations_total",
    "Total Redis operations",
    ["operation", "status"],  # operation: get, set, delete, etc.
)

redis_operation_duration_seconds = Histogram(
    "redis_operation_duration_seconds",
    "Redis operation latency",
    ["operation"],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1],
)

redis_stream_events_total = Counter(
    "redis_stream_events_total",
    "Events published to Redis Streams",
    ["stream_name"],
)

# ============================================================================
# DATABASE METRICS
# ============================================================================

database_query_duration_seconds = Histogram(
    "database_query_duration_seconds",
    "Database query execution time",
    ["query_type"],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5],
)

database_connections_active = Gauge(
    "database_connections_active",
    "Active database connections",
)

database_connections_max = Gauge(
    "database_connections_max",
    "Maximum database connections",
)

database_query_errors_total = Counter(
    "database_query_errors_total",
    "Database query errors",
    ["error_type"],
)

# ============================================================================
# WEBSOCKET METRICS
# ============================================================================

websocket_connections_active = Gauge(
    "websocket_connections_active",
    "Active WebSocket connections",
    ["tenant_id"],
)

websocket_messages_sent_total = Counter(
    "websocket_messages_sent_total",
    "WebSocket messages sent to clients",
    ["message_type"],
)

websocket_connections_total = Counter(
    "websocket_connections_total",
    "Total WebSocket connection attempts",
    ["outcome"],  # accepted, rejected
)

# ============================================================================
# BUSINESS METRICS
# ============================================================================

orders_created_total = Counter(
    "orders_created_total",
    "Total orders created",
    ["tenant_id"],
)

orders_completed_total = Counter(
    "orders_completed_total",
    "Total orders completed",
    ["tenant_id", "status"],  # status: on_time, delayed
)

orders_delayed_count = Gauge(
    "orders_delayed_count",
    "Count of orders currently delayed",
    ["tenant_id"],
)

average_delay_minutes = Gauge(
    "average_delay_minutes",
    "Average delay in minutes for delayed orders",
    ["tenant_id"],
)

reroute_success_rate = Gauge(
    "reroute_success_rate",
    "Percentage of reroutes that successfully prevented delays",
    ["tenant_id"],
)

customer_notifications_sent_total = Counter(
    "customer_notifications_sent_total",
    "Total customer notifications sent",
    ["tenant_id", "notification_type"],
)

# ============================================================================
# SYSTEM METRICS
# ============================================================================

application_info = Info(
    "intelliglog",
    "IntelliLog-AI application information",
)

application_startup_seconds = Gauge(
    "application_startup_seconds",
    "Application startup time in seconds",
)

application_errors_total = Counter(
    "application_errors_total",
    "Total application errors",
    ["error_type", "component"],
)

# ============================================================================
# METRICS UTILITY FUNCTIONS
# ============================================================================


def get_metrics_summary() -> dict:
    """
    Get a summary of key metrics for debugging/monitoring.

    Returns:
        Dictionary with current metric values
    """
    return {
        "active_high_risk_orders": active_high_risk_orders._metrics,
        "optimization_queue_depth": optimization_queue_depth._value.get(),
        "websocket_connections": websocket_connections_active._metrics,
        "http_requests_in_progress": http_requests_in_progress._metrics,
        "database_connections": database_connections_active._value.get(),
    }
