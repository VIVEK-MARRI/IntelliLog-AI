"""
Prometheus Metrics Implementation
Provides all metrics for system, prediction, agent, and business monitoring
"""

from typing import Callable

from prometheus_client import (
    Counter,
    Gauge,
    Histogram,
    Summary,
    CollectorRegistry,
)


# Global registry
REGISTRY = CollectorRegistry()


class APIMetrics:
    """API request and response metrics."""
    
    requests_total = Counter(
        name="api_requests_total",
        documentation="Total API requests",
        labelnames=["method", "endpoint", "status_code"],
        registry=REGISTRY,
    )
    
    request_duration_seconds = Histogram(
        name="api_request_duration_seconds",
        documentation="API request duration in seconds",
        labelnames=["method", "endpoint"],
        buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0),
        registry=REGISTRY,
    )
    
    request_duration_quantiles = Summary(
        name="api_request_duration_quantiles",
        documentation="API request duration quantiles (p50, p95, p99)",
        labelnames=["method", "endpoint"],
        registry=REGISTRY,
    )
    
    errors_total = Counter(
        name="api_errors_total",
        documentation="Total API errors",
        labelnames=["method", "endpoint", "error_type"],
        registry=REGISTRY,
    )
    
    in_progress = Gauge(
        name="api_requests_in_progress",
        documentation="API requests currently in progress",
        labelnames=["method", "endpoint"],
        registry=REGISTRY,
    )


class PredictionMetrics:
    """Prediction service metrics."""
    
    predictions_total = Counter(
        name="predictions_total",
        documentation="Total predictions generated",
        labelnames=["model_version", "status"],
        registry=REGISTRY,
    )
    
    prediction_latency_seconds = Histogram(
        name="prediction_latency_seconds",
        documentation="Prediction generation latency in seconds",
        labelnames=["model_version"],
        buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5),
        registry=REGISTRY,
    )
    
    high_risk_predictions_total = Counter(
        name="high_risk_predictions_total",
        documentation="Total high-risk predictions (risk_score > 0.7)",
        labelnames=["model_version"],
        registry=REGISTRY,
    )
    
    average_risk_score = Gauge(
        name="average_risk_score",
        documentation="Average risk score across recent predictions",
        labelnames=["model_version"],
        registry=REGISTRY,
    )
    
    prediction_confidence = Histogram(
        name="prediction_confidence",
        documentation="Distribution of prediction confidence scores",
        labelnames=["model_version"],
        buckets=(0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.99),
        registry=REGISTRY,
    )
    
    model_errors = Counter(
        name="prediction_model_errors_total",
        documentation="Total prediction model errors",
        labelnames=["model_version", "error_type"],
        registry=REGISTRY,
    )


class AgentMetrics:
    """LangGraph agent decision metrics."""
    
    decisions_total = Counter(
        name="agent_decisions_total",
        documentation="Total agent decisions made",
        labelnames=["decision_type"],
        registry=REGISTRY,
    )
    
    decision_latency_seconds = Histogram(
        name="agent_decision_latency_seconds",
        documentation="Agent decision latency in seconds",
        labelnames=["decision_type"],
        buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0),
        registry=REGISTRY,
    )
    
    reroutes_total = Counter(
        name="agent_reroutes_total",
        documentation="Total rerouting decisions",
        registry=REGISTRY,
    )
    
    alerts_total = Counter(
        name="agent_alerts_total",
        documentation="Total alerts triggered by agent",
        labelnames=["severity"],
        registry=REGISTRY,
    )
    
    failures_total = Counter(
        name="agent_failures_total",
        documentation="Total agent decision failures",
        labelnames=["failure_reason"],
        registry=REGISTRY,
    )
    
    decision_impact = Gauge(
        name="agent_decision_impact_minutes",
        documentation="Minutes saved/lost from last agent decision",
        labelnames=["decision_type"],
        registry=REGISTRY,
    )


class RedisMetrics:
    """Redis activity metrics."""
    
    publish_total = Counter(
        name="redis_publish_total",
        documentation="Total Redis publish operations",
        labelnames=["channel"],
        registry=REGISTRY,
    )
    
    subscribe_total = Counter(
        name="redis_subscribe_total",
        documentation="Total Redis subscribe operations",
        labelnames=["channel"],
        registry=REGISTRY,
    )
    
    failures_total = Counter(
        name="redis_failures_total",
        documentation="Total Redis operation failures",
        labelnames=["operation", "error_type"],
        registry=REGISTRY,
    )
    
    connection_latency_seconds = Histogram(
        name="redis_connection_latency_seconds",
        documentation="Redis connection latency",
        buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1),
        registry=REGISTRY,
    )
    
    command_latency_seconds = Histogram(
        name="redis_command_latency_seconds",
        documentation="Redis command execution latency",
        labelnames=["command"],
        buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1),
        registry=REGISTRY,
    )


class WebSocketMetrics:
    """WebSocket activity metrics."""
    
    connections_active = Gauge(
        name="websocket_connections_active",
        documentation="Active WebSocket connections",
        registry=REGISTRY,
    )
    
    connections_total = Counter(
        name="websocket_connections_total",
        documentation="Total WebSocket connections established",
        registry=REGISTRY,
    )
    
    messages_sent_total = Counter(
        name="websocket_messages_sent_total",
        documentation="Total WebSocket messages sent",
        labelnames=["message_type"],
        registry=REGISTRY,
    )
    
    messages_received_total = Counter(
        name="websocket_messages_received_total",
        documentation="Total WebSocket messages received",
        labelnames=["message_type"],
        registry=REGISTRY,
    )
    
    connection_duration_seconds = Histogram(
        name="websocket_connection_duration_seconds",
        documentation="WebSocket connection duration in seconds",
        buckets=(1, 5, 10, 30, 60, 300, 900, 3600),
        registry=REGISTRY,
    )
    
    failures_total = Counter(
        name="websocket_failures_total",
        documentation="Total WebSocket connection failures",
        labelnames=["failure_reason"],
        registry=REGISTRY,
    )


class DatabaseMetrics:
    """Database operation metrics."""
    
    query_latency_seconds = Histogram(
        name="database_query_latency_seconds",
        documentation="Database query latency in seconds",
        labelnames=["query_type", "table"],
        buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0),
        registry=REGISTRY,
    )
    
    queries_total = Counter(
        name="database_queries_total",
        documentation="Total database queries",
        labelnames=["query_type", "table"],
        registry=REGISTRY,
    )
    
    errors_total = Counter(
        name="database_errors_total",
        documentation="Total database query errors",
        labelnames=["query_type", "error_type"],
        registry=REGISTRY,
    )
    
    connection_pool_size = Gauge(
        name="database_connection_pool_size",
        documentation="Database connection pool size",
        registry=REGISTRY,
    )
    
    connections_in_use = Gauge(
        name="database_connections_in_use",
        documentation="Database connections currently in use",
        registry=REGISTRY,
    )


class BusinessMetrics:
    """Business/operational KPI metrics."""
    
    active_shipments_total = Gauge(
        name="active_shipments_total",
        documentation="Total active shipments",
        registry=REGISTRY,
    )
    
    delayed_shipments_total = Gauge(
        name="delayed_shipments_total",
        documentation="Total delayed shipments",
        registry=REGISTRY,
    )
    
    high_risk_shipments_total = Gauge(
        name="high_risk_shipments_total",
        documentation="Total high-risk shipments (risk_score > 0.7)",
        registry=REGISTRY,
    )
    
    average_eta_minutes = Gauge(
        name="average_eta_minutes",
        documentation="Average estimated time to arrival in minutes",
        registry=REGISTRY,
    )
    
    average_delay_minutes = Gauge(
        name="average_delay_minutes",
        documentation="Average delay in minutes across all delayed shipments",
        registry=REGISTRY,
    )
    
    route_savings_minutes_total = Counter(
        name="route_savings_minutes_total",
        documentation="Total minutes saved through route optimization",
        registry=REGISTRY,
    )
    
    agent_interventions_total = Counter(
        name="agent_interventions_total",
        documentation="Total agent interventions in shipment management",
        labelnames=["intervention_type"],
        registry=REGISTRY,
    )
    
    on_time_deliveries_total = Counter(
        name="on_time_deliveries_total",
        documentation="Total on-time deliveries",
        registry=REGISTRY,
    )
    
    failed_deliveries_total = Counter(
        name="failed_deliveries_total",
        documentation="Total failed deliveries",
        labelnames=["failure_reason"],
        registry=REGISTRY,
    )
    
    fleet_health_score = Gauge(
        name="fleet_health_score",
        documentation="Overall fleet health score (0-100)",
        registry=REGISTRY,
    )
    
    operational_efficiency_score = Gauge(
        name="operational_efficiency_score",
        documentation="Overall operational efficiency score (0-100)",
        registry=REGISTRY,
    )


class SystemMetrics:
    """System and infrastructure metrics."""
    
    uptime_seconds = Gauge(
        name="application_uptime_seconds",
        documentation="Application uptime in seconds",
        registry=REGISTRY,
    )
    
    startup_time_seconds = Gauge(
        name="application_startup_time_seconds",
        documentation="Application startup time in seconds",
        registry=REGISTRY,
    )


def record_api_call(
    method: str,
    endpoint: str,
    status_code: int,
    duration_ms: float,
) -> None:
    """Record an API call."""
    APIMetrics.requests_total.labels(
        method=method, endpoint=endpoint, status_code=status_code
    ).inc()
    APIMetrics.request_duration_seconds.labels(
        method=method, endpoint=endpoint
    ).observe(duration_ms / 1000.0)
    APIMetrics.request_duration_quantiles.labels(
        method=method, endpoint=endpoint
    ).observe(duration_ms / 1000.0)


def record_api_error(
    method: str,
    endpoint: str,
    error_type: str,
) -> None:
    """Record an API error."""
    APIMetrics.errors_total.labels(
        method=method, endpoint=endpoint, error_type=error_type
    ).inc()


def record_prediction(
    model_version: str,
    risk_score: float,
    confidence: float,
    latency_ms: float,
    status: str = "success",
) -> None:
    """Record a prediction."""
    PredictionMetrics.predictions_total.labels(
        model_version=model_version, status=status
    ).inc()
    PredictionMetrics.prediction_latency_seconds.labels(
        model_version=model_version
    ).observe(latency_ms / 1000.0)
    PredictionMetrics.prediction_confidence.labels(
        model_version=model_version
    ).observe(confidence)
    
    if risk_score > 0.7:
        PredictionMetrics.high_risk_predictions_total.labels(
            model_version=model_version
        ).inc()
    
    # Update moving average
    PredictionMetrics.average_risk_score.labels(
        model_version=model_version
    ).set(risk_score)


def record_agent_decision(
    decision_type: str,
    latency_ms: float,
    impact_minutes: float = 0.0,
) -> None:
    """Record an agent decision."""
    AgentMetrics.decisions_total.labels(decision_type=decision_type).inc()
    AgentMetrics.decision_latency_seconds.labels(
        decision_type=decision_type
    ).observe(latency_ms / 1000.0)
    if impact_minutes != 0.0:
        AgentMetrics.decision_impact.labels(
            decision_type=decision_type
        ).set(impact_minutes)


def record_redis_publish(channel: str) -> None:
    """Record a Redis publish operation."""
    RedisMetrics.publish_total.labels(channel=channel).inc()


def record_websocket_message(
    message_type: str,
    direction: str = "sent",
) -> None:
    """Record a WebSocket message."""
    if direction == "sent":
        WebSocketMetrics.messages_sent_total.labels(message_type=message_type).inc()
    else:
        WebSocketMetrics.messages_received_total.labels(message_type=message_type).inc()
