"""
Structured Logging Configuration
Provides JSON logging for all application events using structlog
"""

import logging
import sys
from typing import Any

import structlog
from pythonjsonlogger import jsonlogger


def configure_logging(
    service_name: str = "intelliglog-ai",
    environment: str = "development",
    log_level: str = "INFO",
) -> None:
    """
    Configure structlog with JSON output.
    
    Args:
        service_name: Name of the service (e.g., "intelliglog-ai")
        environment: Deployment environment (development, staging, production)
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
    """
    
    # Configure standard logging first
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    
    # JSON formatter for standard logging
    json_formatter = jsonlogger.JsonFormatter(
        fmt="%(timestamp)s %(level)s %(name)s %(message)s",
        timestamp=True,
    )
    
    # Console handler with JSON formatter
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(json_formatter)
    root_logger.addHandler(console_handler)
    
    # Configure structlog
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer(),
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.typing.FilteringBoundLogger:
    """
    Get a configured logger instance.
    
    Args:
        name: Logger name (typically __name__)
        
    Returns:
        Configured structlog logger
    """
    return structlog.get_logger(name)


class LogContext:
    """Context manager for adding request-scoped logging context."""
    
    def __init__(self, **context: Any) -> None:
        """
        Initialize logging context.
        
        Args:
            **context: Key-value pairs to add to all logs in this context
        """
        self.context = context
        self.token: structlog.typing.Context | None = None
    
    def __enter__(self) -> "LogContext":
        """Enter context and bind variables."""
        self.token = structlog.contextvars.bind_contextvars(**self.context)
        return self
    
    def __exit__(self, *args: Any) -> None:
        """Exit context and unbind variables."""
        if self.token:
            structlog.contextvars.clear_contextvars()


# Event logging functions for common events

def log_api_request(
    endpoint: str,
    method: str,
    request_id: str,
    logger: structlog.typing.FilteringBoundLogger,
) -> None:
    """Log incoming API request."""
    logger.info("api_request", endpoint=endpoint, method=method, request_id=request_id)


def log_api_response(
    endpoint: str,
    method: str,
    status_code: int,
    latency_ms: float,
    request_id: str,
    logger: structlog.typing.FilteringBoundLogger,
) -> None:
    """Log API response."""
    logger.info(
        "api_response",
        endpoint=endpoint,
        method=method,
        status_code=status_code,
        latency_ms=latency_ms,
        request_id=request_id,
    )


def log_prediction_generated(
    order_id: str,
    risk_score: float,
    confidence: float,
    latency_ms: float,
    logger: structlog.typing.FilteringBoundLogger,
) -> None:
    """Log prediction generation."""
    logger.info(
        "prediction_generated",
        order_id=order_id,
        risk_score=risk_score,
        confidence=confidence,
        latency_ms=latency_ms,
    )


def log_agent_decision(
    order_id: str,
    decision_type: str,
    reasoning: str,
    risk_score: float,
    latency_ms: float,
    logger: structlog.typing.FilteringBoundLogger,
) -> None:
    """Log agent decision."""
    logger.info(
        "agent_decision",
        order_id=order_id,
        decision_type=decision_type,
        reasoning=reasoning,
        risk_score=risk_score,
        latency_ms=latency_ms,
    )


def log_redis_event(
    event_type: str,
    channel: str,
    message_count: int | None = None,
    latency_ms: float | None = None,
    logger: structlog.typing.FilteringBoundLogger = None,
) -> None:
    """Log Redis event."""
    if logger is None:
        logger = get_logger(__name__)
    
    logger.info(
        f"redis_{event_type}",
        channel=channel,
        message_count=message_count,
        latency_ms=latency_ms,
    )


def log_websocket_event(
    event_type: str,
    connection_id: str,
    client_ip: str,
    logger: structlog.typing.FilteringBoundLogger,
) -> None:
    """Log WebSocket event."""
    logger.info(
        f"websocket_{event_type}",
        connection_id=connection_id,
        client_ip=client_ip,
    )


def log_exception(
    error_type: str,
    message: str,
    context: dict[str, Any] | None = None,
    logger: structlog.typing.FilteringBoundLogger = None,
) -> None:
    """Log exception."""
    if logger is None:
        logger = get_logger(__name__)
    
    logger.exception(
        "exception",
        error_type=error_type,
        message=message,
        **(context or {}),
    )


def log_database_event(
    event_type: str,
    query_type: str,
    table: str,
    latency_ms: float,
    logger: structlog.typing.FilteringBoundLogger,
) -> None:
    """Log database event."""
    logger.info(
        f"database_{event_type}",
        query_type=query_type,
        table=table,
        latency_ms=latency_ms,
    )
