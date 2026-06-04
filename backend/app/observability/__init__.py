"""
Observability Package
Provides logging, metrics, middleware, and health checks for IntelliLog-AI
"""

from .logging import (
    configure_logging,
    get_logger,
    LogContext,
    log_api_request,
    log_api_response,
    log_prediction_generated,
    log_agent_decision,
    log_redis_event,
    log_websocket_event,
    log_exception,
    log_database_event,
)
from .metrics import (
    REGISTRY,
    APIMetrics,
    PredictionMetrics,
    AgentMetrics,
    RedisMetrics,
    WebSocketMetrics,
    DatabaseMetrics,
    BusinessMetrics,
    SystemMetrics,
    record_api_call,
    record_api_error,
    record_prediction,
    record_agent_decision,
    record_redis_publish,
    record_websocket_message,
)
from .middleware import ObservabilityMiddleware
from .health import (
    HealthStatus,
    HealthChecker,
    set_health_checker,
    router as health_router,
)

__all__ = [
    "configure_logging",
    "get_logger",
    "LogContext",
    "log_api_request",
    "log_api_response",
    "log_prediction_generated",
    "log_agent_decision",
    "log_redis_event",
    "log_websocket_event",
    "log_exception",
    "log_database_event",
    "REGISTRY",
    "APIMetrics",
    "PredictionMetrics",
    "AgentMetrics",
    "RedisMetrics",
    "WebSocketMetrics",
    "DatabaseMetrics",
    "BusinessMetrics",
    "SystemMetrics",
    "record_api_call",
    "record_api_error",
    "record_prediction",
    "record_agent_decision",
    "record_redis_publish",
    "record_websocket_message",
    "ObservabilityMiddleware",
    "HealthStatus",
    "HealthChecker",
    "set_health_checker",
    "health_router",
]
