"""
Observability Middleware for FastAPI
Automatically collects metrics for all requests and responses
"""

import time
from typing import Awaitable, Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from .logging import get_logger, LogContext
from .metrics import APIMetrics, record_api_call, record_api_error


logger = get_logger(__name__)


class ObservabilityMiddleware(BaseHTTPMiddleware):
    """
    Middleware for collecting observability data on all API requests.
    
    Tracks:
    - Request count by method, endpoint, and status code
    - Request duration (histogram and summary for p50, p95, p99)
    - Errors by type
    - In-progress request count
    """
    
    def __init__(self, app: ASGIApp) -> None:
        """Initialize middleware."""
        super().__init__(app)
    
    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        """
        Process request and collect observability data.
        
        Args:
            request: Incoming request
            call_next: Next middleware/handler
            
        Returns:
            Response from handler
        """
        # Extract request information
        method = request.method
        path = request.url.path
        request_id = request.headers.get("x-request-id", "unknown")
        client_ip = request.client.host if request.client else "unknown"
        
        # Normalize endpoint path (e.g., /orders/123 -> /orders/{id})
        endpoint = self._normalize_endpoint(path)
        
        # Track in-progress requests
        APIMetrics.in_progress.labels(method=method, endpoint=endpoint).inc()
        
        # Start timing
        start_time = time.perf_counter()
        
        # Add to logging context
        with LogContext(
            request_id=request_id,
            method=method,
            endpoint=endpoint,
            client_ip=client_ip,
        ):
            logger.info(
                "http_request_started",
                method=method,
                endpoint=endpoint,
                path=path,
                query_string=request.url.query,
            )
            
            try:
                # Call next middleware/handler
                response = await call_next(request)
                
                # Calculate duration
                duration_ms = (time.perf_counter() - start_time) * 1000
                
                # Record metrics
                record_api_call(
                    method=method,
                    endpoint=endpoint,
                    status_code=response.status_code,
                    duration_ms=duration_ms,
                )
                
                # Log response
                logger.info(
                    "http_request_completed",
                    status_code=response.status_code,
                    duration_ms=duration_ms,
                )
                
                return response
                
            except Exception as exc:
                # Calculate duration
                duration_ms = (time.perf_counter() - start_time) * 1000
                
                # Determine error type
                error_type = type(exc).__name__
                
                # Record error
                record_api_error(
                    method=method,
                    endpoint=endpoint,
                    error_type=error_type,
                )
                
                # Log exception
                logger.exception(
                    "http_request_failed",
                    error_type=error_type,
                    duration_ms=duration_ms,
                    exc_info=True,
                )
                
                raise
                
            finally:
                # Track in-progress requests
                APIMetrics.in_progress.labels(method=method, endpoint=endpoint).dec()
    
    @staticmethod
    def _normalize_endpoint(path: str) -> str:
        """
        Normalize endpoint path to avoid cardinality explosion.
        
        Examples:
            /orders/123 -> /orders/{id}
            /predictions/456/details -> /predictions/{id}/details
            /health -> /health
            
        Args:
            path: Request path
            
        Returns:
            Normalized endpoint path
        """
        parts = path.strip("/").split("/")
        normalized_parts = []
        
        for i, part in enumerate(parts):
            # Check if this part looks like an ID (UUID, integer, etc.)
            if part.isdigit() or (
                len(part) == 36 and part.count("-") == 4
            ):  # UUID pattern
                normalized_parts.append("{id}")
            elif i > 0 and parts[i - 1] == "orders" and part.isdigit():
                normalized_parts.append("{order_id}")
            elif i > 0 and parts[i - 1] == "users" and part.isdigit():
                normalized_parts.append("{user_id}")
            elif i > 0 and parts[i - 1] == "predictions" and part.isdigit():
                normalized_parts.append("{prediction_id}")
            else:
                normalized_parts.append(part)
        
        return "/" + "/".join(normalized_parts) if normalized_parts else "/"
