"""
Structured logging configuration for IntelliLog-AI.
Supports JSON output (production) and colored console output (development).
"""

import logging
import logging.config
import sys
from typing import Any, Dict, Optional

import structlog


def _add_context(
    logger: Any,
    method_name: str,
    event_dict: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Add context to every log entry.
    Includes request_id, tenant_id, service_name, environment.
    """
    # Get context from structlog context vars (set by middleware)
    request_id = structlog.contextvars.get_contextvars().get("request_id")
    tenant_id = structlog.contextvars.get_contextvars().get("tenant_id")
    service_name = structlog.contextvars.get_contextvars().get("service_name", "intelliglog")
    environment = structlog.contextvars.get_contextvars().get("environment", "development")

    if request_id:
        event_dict["request_id"] = request_id
    if tenant_id:
        event_dict["tenant_id"] = tenant_id

    event_dict["service"] = service_name
    event_dict["environment"] = environment

    return event_dict


def configure_logging(environment: str, log_level: str = "INFO") -> None:
    """
    Configure structlog for the application.

    Args:
        environment: "development" or "production"
        log_level: DEBUG, INFO, WARNING, ERROR, CRITICAL
    """
    # Determine output format based on environment
    is_production = environment == "production"

    # Configure standard library logging
    logging_config = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {
                "format": "%(message)s",
            },
        },
        "handlers": {
            "default": {
                "level": log_level,
                "class": "logging.StreamHandler",
                "formatter": "default",
                "stream": "ext://sys.stdout",
            },
        },
        "loggers": {
            "": {
                "handlers": ["default"],
                "level": log_level,
                "propagate": True,
            },
            # Quiet noisy loggers
            "asyncio": {"level": "WARNING"},
            "uvicorn.access": {"level": "WARNING"},
        },
    }

    logging.config.dictConfig(logging_config)

    # Configure structlog
    structlog.configure(
        processors=[
            # Add context (request_id, tenant_id, etc.)
            _add_context,
            # Add timestamp
            structlog.processors.TimeStamper(fmt="iso"),
            # Add log level
            structlog.processors.add_log_level,
            # Convert exceptions to strings
            structlog.processors.ExceptionFormatter(),
            # For production: JSON output
            # For development: colored console output
            structlog.processors.JSONRenderer()
            if is_production
            else structlog.dev.ConsoleRenderer(),
        ],
        context_class=structlog.contextvars.as_immutable_dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=False,
    )


def get_logger(name: str) -> structlog.BoundLogger:
    """
    Get a structlog logger bound to the given component name.

    Args:
        name: Component/module name (e.g., "agent.graph", "ml.inference")

    Returns:
        BoundLogger with name pre-bound
    """
    logger = structlog.get_logger(name)
    return logger.bind(component=name)


# Pre-configured loggers for common components
logger_agent = get_logger("agent")
logger_ml = get_logger("ml")
logger_optimization = get_logger("optimization")
logger_api = get_logger("api")
logger_database = get_logger("database")
