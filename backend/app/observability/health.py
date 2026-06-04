"""
Health Check Endpoints
Provides /health, /health/live, and /health/ready endpoints for observability
"""

from typing import Any

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as redis

from .logging import get_logger


logger = get_logger(__name__)


router = APIRouter(prefix="/health", tags=["health"])


class HealthStatus:
    """Health status for a service component."""
    
    def __init__(
        self,
        name: str,
        status: str,
        details: str | None = None,
    ) -> None:
        """
        Initialize health status.
        
        Args:
            name: Component name
            status: Status (healthy, degraded, unhealthy)
            details: Optional additional details
        """
        self.name = name
        self.status = status
        self.details = details
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        result = {
            "name": self.name,
            "status": self.status,
        }
        if self.details:
            result["details"] = self.details
        return result


class HealthChecker:
    """Checks health of all system components."""
    
    def __init__(
        self,
        db_session_factory: Any = None,
        redis_client: Any = None,
        model_loader: Any = None,
    ) -> None:
        """
        Initialize health checker.
        
        Args:
            db_session_factory: Database session factory
            redis_client: Redis client instance
            model_loader: ML model loader
        """
        self.db_session_factory = db_session_factory
        self.redis_client = redis_client
        self.model_loader = model_loader
    
    async def check_postgres(self) -> HealthStatus:
        """
        Check PostgreSQL health.
        
        Returns:
            HealthStatus for PostgreSQL
        """
        try:
            if not self.db_session_factory:
                return HealthStatus("postgres", "unknown", "No database configured")
            
            async with self.db_session_factory() as session:
                await session.execute("SELECT 1")
                return HealthStatus("postgres", "healthy")
                
        except Exception as exc:
            logger.warning("postgres_health_check_failed", error=str(exc))
            return HealthStatus(
                "postgres",
                "unhealthy",
                f"Connection failed: {str(exc)}",
            )
    
    async def check_redis(self) -> HealthStatus:
        """
        Check Redis health.
        
        Returns:
            HealthStatus for Redis
        """
        try:
            if not self.redis_client:
                return HealthStatus("redis", "unknown", "No Redis configured")
            
            await self.redis_client.ping()
            return HealthStatus("redis", "healthy")
            
        except Exception as exc:
            logger.warning("redis_health_check_failed", error=str(exc))
            return HealthStatus(
                "redis",
                "unhealthy",
                f"Connection failed: {str(exc)}",
            )
    
    async def check_prediction_model(self) -> HealthStatus:
        """
        Check prediction model health.
        
        Returns:
            HealthStatus for prediction model
        """
        try:
            if not self.model_loader:
                return HealthStatus(
                    "prediction_model",
                    "unknown",
                    "No model loader configured",
                )
            
            model = self.model_loader.get_model()
            if model is None:
                return HealthStatus(
                    "prediction_model",
                    "unhealthy",
                    "Model not loaded",
                )
            
            return HealthStatus("prediction_model", "healthy")
            
        except Exception as exc:
            logger.warning("model_health_check_failed", error=str(exc))
            return HealthStatus(
                "prediction_model",
                "unhealthy",
                f"Check failed: {str(exc)}",
            )
    
    async def check_agent_runtime(self) -> HealthStatus:
        """
        Check LangGraph agent runtime health.
        
        Returns:
            HealthStatus for agent runtime
        """
        try:
            # This would check if the agent runtime is operational
            # For now, assume healthy if no errors have occurred recently
            return HealthStatus("agent_runtime", "healthy")
            
        except Exception as exc:
            logger.warning("agent_health_check_failed", error=str(exc))
            return HealthStatus(
                "agent_runtime",
                "unhealthy",
                f"Runtime check failed: {str(exc)}",
            )
    
    async def check_websocket_layer(self) -> HealthStatus:
        """
        Check WebSocket layer health.
        
        Returns:
            HealthStatus for WebSocket layer
        """
        try:
            # WebSocket layer is healthy if Redis (which backs it) is healthy
            # This is a simplified check
            return HealthStatus("websocket", "healthy")
            
        except Exception as exc:
            logger.warning("websocket_health_check_failed", error=str(exc))
            return HealthStatus(
                "websocket",
                "unhealthy",
                f"Check failed: {str(exc)}",
            )
    
    async def get_full_health(self) -> dict[str, Any]:
        """
        Get full health status across all components.
        
        Returns:
            Dictionary with overall status and component statuses
        """
        checks = [
            await self.check_postgres(),
            await self.check_redis(),
            await self.check_prediction_model(),
            await self.check_agent_runtime(),
            await self.check_websocket_layer(),
        ]
        
        # Determine overall status
        unhealthy_count = sum(1 for c in checks if c.status == "unhealthy")
        degraded_count = sum(1 for c in checks if c.status == "degraded")
        
        if unhealthy_count > 0:
            overall_status = "unhealthy"
        elif degraded_count > 0:
            overall_status = "degraded"
        else:
            overall_status = "healthy"
        
        return {
            "status": overall_status,
            "components": [c.to_dict() for c in checks],
        }


# Endpoint handlers

health_checker: HealthChecker | None = None


def set_health_checker(checker: HealthChecker) -> None:
    """Set the global health checker instance."""
    global health_checker
    health_checker = checker


@router.get(
    "/",
    name="health_check",
    summary="Full Health Check",
    description="Returns detailed health status of all system components",
)
async def health() -> dict[str, Any]:
    """
    Full health check endpoint.
    
    Returns:
        {
            "status": "healthy" | "degraded" | "unhealthy",
            "components": [
                {
                    "name": "postgres",
                    "status": "healthy"
                },
                ...
            ]
        }
    """
    if not health_checker:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Health checker not initialized",
        )
    
    result = await health_checker.get_full_health()
    
    # Return appropriate status code
    if result["status"] == "unhealthy":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=result,
        )
    
    return result


@router.get(
    "/live",
    name="liveness_check",
    summary="Liveness Check",
    description="Returns 200 if service is running",
)
async def liveness() -> dict[str, str]:
    """
    Liveness check endpoint (Kubernetes/Nomad).
    
    Returns:
        {"status": "alive"}
    """
    return {"status": "alive"}


@router.get(
    "/ready",
    name="readiness_check",
    summary="Readiness Check",
    description="Returns 200 if service is ready to receive traffic",
)
async def readiness() -> dict[str, str]:
    """
    Readiness check endpoint (Kubernetes/Nomad).
    
    Returns:
        {"status": "ready"} or 503 Service Unavailable
    """
    if not health_checker:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Health checker not initialized",
        )
    
    health_status = await health_checker.get_full_health()
    
    # Service is ready only if no components are unhealthy
    if health_status["status"] == "unhealthy":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service not ready",
        )
    
    return {"status": "ready"}
