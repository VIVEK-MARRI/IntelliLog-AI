"""
Agent tools - Real functions that the agent invokes.

Each tool has side effects and must be robust:
- Timeouts with graceful fallbacks
- Proper error handling
- Logging of all calls
- Type-safe inputs/outputs
"""

from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
import json
from typing import Optional, Any
import structlog
import httpx
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession
import math

logger = structlog.get_logger(__name__)


# ===== Response Models =====

@dataclass
class RouteOptimizerResult:
    """Response from route optimization service."""
    success: bool
    new_waypoints: Optional[list[dict]] = None  # [{"lat": x, "lng": y, "address": "..."}]
    time_saved_minutes: float = 0.0
    solver_status: str = "unknown"  # "optimal", "feasible", "timeout", "error"
    solver_duration_ms: float = 0.0


@dataclass
class NotificationResult:
    """Response from customer notification."""
    success: bool
    notification_id: Optional[str] = None
    error_message: Optional[str] = None


# ===== Tool: call_route_optimizer =====

async def call_route_optimizer(
    order_id: str,
    current_lat: float,
    current_lng: float,
    remaining_stops: list[dict],
    tenant_id: str,
    http_client: httpx.AsyncClient,
) -> RouteOptimizerResult:
    """
    Asynchronously submits a re-routing request for an order.
    Uses OR-Tools VRP to find optimal ordering of remaining stops
    given the driver's current position.
    
    EXPENSIVE: takes 200-500ms. Only invoke when risk_score > 0.70.
    
    Args:
        order_id: Order identifier
        current_lat: Current latitude
        current_lng: Current longitude
        remaining_stops: List of remaining stops with lat/lng/address
        tenant_id: Tenant identifier
        http_client: Async HTTP client
        
    Returns:
        RouteOptimizerResult with optimized waypoints or timeout status
    """
    start_time = datetime.now(timezone.utc)
    
    try:
        # Build request payload
        payload = {
            "order_id": order_id,
            "tenant_id": tenant_id,
            "current_position": {
                "lat": current_lat,
                "lng": current_lng,
            },
            "remaining_stops": remaining_stops,
        }
        
        # Call optimizer service (mocked URL - replace with real endpoint)
        optimizer_url = "http://route-optimizer:8080/optimize"
        
        try:
            response = await http_client.post(
                optimizer_url,
                json=payload,
                timeout=2.0,  # 2 second hard timeout
            )
            response.raise_for_status()
        except httpx.TimeoutException:
            await logger.awarning(
                "route_optimizer_timeout",
                order_id=order_id,
                duration_ms=(datetime.now(timezone.utc) - start_time).total_seconds() * 1000,
            )
            return RouteOptimizerResult(
                success=False,
                solver_status="timeout",
                solver_duration_ms=(datetime.now(timezone.utc) - start_time).total_seconds() * 1000,
            )
        except httpx.HTTPError as e:
            await logger.aerror(
                "route_optimizer_http_error",
                order_id=order_id,
                error=str(e),
            )
            return RouteOptimizerResult(
                success=False,
                solver_status="error",
                solver_duration_ms=(datetime.now(timezone.utc) - start_time).total_seconds() * 1000,
            )
        
        # Parse response
        result_data = response.json()
        
        time_saved = result_data.get("time_saved_minutes", 0.0)
        
        await logger.ainfo(
            "route_optimizer_success",
            order_id=order_id,
            time_saved_minutes=time_saved,
            solver_status=result_data.get("status", "unknown"),
            duration_ms=(datetime.now(timezone.utc) - start_time).total_seconds() * 1000,
        )
        
        return RouteOptimizerResult(
            success=True,
            new_waypoints=result_data.get("waypoints", []),
            time_saved_minutes=time_saved,
            solver_status=result_data.get("status", "unknown"),
            solver_duration_ms=(datetime.now(timezone.utc) - start_time).total_seconds() * 1000,
        )
    
    except Exception as e:
        await logger.aerror(
            "route_optimizer_failed",
            order_id=order_id,
            error=str(e),
        )
        return RouteOptimizerResult(
            success=False,
            solver_status="error",
            solver_duration_ms=(datetime.now(timezone.utc) - start_time).total_seconds() * 1000,
        )


# ===== Tool: send_customer_notification =====

async def send_customer_notification(
    order_id: str,
    tenant_id: str,
    delay_minutes: float,
    reason: str,
    new_eta: datetime,
    http_client: httpx.AsyncClient,
    redis_client: Redis,
) -> NotificationResult:
    """
    Sends delay notification to customer via tenant webhook.
    Rate-limited: max 1 notification per order per 30 minutes.
    
    Args:
        order_id: Order identifier
        tenant_id: Tenant identifier
        delay_minutes: Estimated delay
        reason: Human-readable reason (from SHAP)
        new_eta: Updated ETA
        http_client: Async HTTP client
        redis_client: Redis for rate limiting check
        
    Returns:
        NotificationResult with success status
    """
    try:
        # === Rate Limiting Check ===
        rate_limit_key = f"notification_rate:{order_id}"
        last_notified = await redis_client.get(rate_limit_key)
        
        if last_notified is not None:
            await logger.ainfo(
                "notification_rate_limited",
                order_id=order_id,
                reason="notification_sent_in_last_30_min",
            )
            return NotificationResult(
                success=False,
                error_message="Rate limited: notification sent in last 30 minutes",
            )
        
        # === Get Tenant Webhook URL ===
        # In production, this would come from tenant config database
        # For now, we'll use a placeholder
        webhook_key = f"tenant:{tenant_id}:webhook_url"
        webhook_url = await redis_client.get(webhook_key)
        
        if not webhook_url:
            await logger.awarning(
                "no_webhook_configured",
                tenant_id=tenant_id,
            )
            return NotificationResult(
                success=False,
                error_message="No webhook URL configured for tenant",
            )
        
        webhook_url = webhook_url.decode() if isinstance(webhook_url, bytes) else webhook_url
        
        # === Build Notification Payload ===
        payload = {
            "event": "delivery.delay_warning",
            "order_id": order_id,
            "delay_minutes": round(delay_minutes, 0),
            "reason": reason,
            "new_eta": new_eta.isoformat(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        
        # === Send Webhook ===
        try:
            response = await http_client.post(
                webhook_url,
                json=payload,
                timeout=5.0,
            )
            response.raise_for_status()
        except httpx.TimeoutException:
            await logger.awarning(
                "webhook_timeout",
                order_id=order_id,
                webhook_url=webhook_url,
            )
            return NotificationResult(
                success=False,
                error_message="Webhook request timed out",
            )
        except httpx.HTTPError as e:
            await logger.aerror(
                "webhook_http_error",
                order_id=order_id,
                webhook_url=webhook_url,
                status_code=e.response.status_code if hasattr(e, 'response') else None,
                error=str(e),
            )
            return NotificationResult(
                success=False,
                error_message=f"Webhook HTTP error: {str(e)}",
            )
        
        # === Set Rate Limit ===
        await redis_client.setex(
            rate_limit_key,
            30 * 60,  # 30 minutes
            "1",
        )
        
        await logger.ainfo(
            "notification_sent",
            order_id=order_id,
            tenant_id=tenant_id,
            delay_minutes=delay_minutes,
        )
        
        return NotificationResult(
            success=True,
            notification_id=f"{order_id}:{datetime.now(timezone.utc).timestamp()}",
        )
    
    except Exception as e:
        await logger.aerror(
            "send_notification_failed",
            order_id=order_id,
            error=str(e),
        )
        return NotificationResult(
            success=False,
            error_message=str(e),
        )


# ===== Tool: update_order_eta =====

async def update_order_eta(
    order_id: str,
    new_eta: datetime,
    reason: str,
    db_session: AsyncSession,
    redis_client: Redis,
) -> bool:
    """
    Updates order's current_eta in PostgreSQL and publishes
    ETA_UPDATED event to Redis pub/sub for real-time dashboard updates.
    
    Args:
        order_id: Order identifier
        new_eta: New estimated time of arrival
        reason: Why ETA changed
        db_session: AsyncSession for database
        redis_client: Redis for pub/sub
        
    Returns:
        True if successful, False otherwise
    """
    try:
        # === Update in PostgreSQL ===
        result = await db_session.execute(
            "UPDATE orders SET actual_eta = :eta, updated_at = :now WHERE id = :order_id",
            {"eta": new_eta, "now": datetime.now(timezone.utc), "order_id": order_id},
        )
        
        if result.rowcount == 0:
            await logger.awarning(
                "order_not_found_for_eta_update",
                order_id=order_id,
            )
            return False
        
        await db_session.commit()
        
        # === Publish Event ===
        event_payload = {
            "order_id": order_id,
            "new_eta": new_eta.isoformat(),
            "reason": reason,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        
        # Get tenant_id for scoped pub/sub
        # In production, this would come from the order query result
        tenant_key = f"order_tenant:{order_id}"
        tenant_id = await redis_client.get(tenant_key)
        
        if tenant_id:
            tenant_id = tenant_id.decode() if isinstance(tenant_id, bytes) else tenant_id
            channel = f"tenant:{tenant_id}:eta_updated"
            await redis_client.publish(channel, json.dumps(event_payload))

            from src.db.redis_schema import get_pubsub_events_channel

            await redis_client.publish(
                get_pubsub_events_channel(tenant_id),
                json.dumps(
                    {
                        "type": "eta_updated",
                        "order_id": order_id,
                        "tenant_id": tenant_id,
                        "new_eta": new_eta.isoformat(),
                        "reason": reason,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                ),
            )
        
        await logger.ainfo(
            "eta_updated",
            order_id=order_id,
            new_eta=new_eta.isoformat(),
            reason=reason,
        )
        
        return True
    
    except Exception as e:
        await logger.aerror(
            "update_eta_failed",
            order_id=order_id,
            error=str(e),
        )
        return False


# ===== Tool: write_audit_log =====

async def write_audit_log(
    order_id: str,
    tenant_id: str,
    driver_id: str,
    decision: str,
    risk_score: float,
    top_risk_factors: list[dict],
    tools_called: list[str],
    reroute_result: Optional[dict],
    notification_result: Optional[dict],
    db_session: AsyncSession,
    redis_client=None,
) -> Optional[str]:
    """
    Writes complete record of agent decision to agent_decisions table.
    Called on EVERY decision (including no_action).
    
    Args:
        order_id: Order identifier
        tenant_id: Tenant identifier
        driver_id: Driver identifier
        decision: Decision made ('no_action', 'alert_only', 'reroute_and_alert')
        risk_score: Risk score from model
        top_risk_factors: Top SHAP factors
        tools_called: List of tools invoked
        reroute_result: Result from route optimizer (if called)
        notification_result: Result from notification (if called)
        db_session: AsyncSession for database
        
    Returns:
        audit_log_id if successful, None otherwise
    """
    try:
        # In production, this would insert into agent_decisions table
        # For now, we'll log it structurally
        
        audit_record = {
            "order_id": order_id,
            "tenant_id": tenant_id,
            "driver_id": driver_id,
            "decision": decision,
            "risk_score": risk_score,
            "top_risk_factors": top_risk_factors,
            "tools_called": tools_called,
            "reroute_result": reroute_result,
            "notification_result": notification_result,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        
        # Mock audit log ID
        audit_log_id = f"audit:{order_id}:{datetime.now(timezone.utc).timestamp()}"
        
        await logger.ainfo(
            "agent_decision_audit",
            **audit_record,
            audit_log_id=audit_log_id,
        )

        if redis_client is not None:
            from src.db.redis_schema import get_agent_updates_channel, get_pubsub_events_channel
            import json

            await redis_client.publish(
                get_agent_updates_channel(),
                json.dumps(
                    {
                        "type": "agent_updated",
                        "order_id": order_id,
                        "tenant_id": tenant_id,
                        "decision": decision,
                        "risk_score": risk_score,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                ),
            )

            await redis_client.publish(
                get_pubsub_events_channel(tenant_id),
                json.dumps(
                    {
                        "type": "agent_decision",
                        "order_id": order_id,
                        "tenant_id": tenant_id,
                        "decision": decision,
                        "risk_score": risk_score,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                ),
            )
        
        # In production: insert into database
        # await db_session.execute(
        #     "INSERT INTO agent_decisions (...) VALUES (...)",
        #     audit_record
        # )
        # await db_session.commit()
        
        return audit_log_id
    
    except Exception as e:
        await logger.aerror(
            "write_audit_log_failed",
            order_id=order_id,
            error=str(e),
        )
        # Do NOT fail - audit logging is best-effort
        return None
