"""
Operational insights router.
Provides dashboard summary data for the frontend.
"""

from fastapi import APIRouter, Depends

from src.api.auth import AuthenticatedTenant, get_current_tenant
from src.api.deps import get_db, get_redis
from src.api.services.analytics import AnalyticsService

router = APIRouter(tags=["insights"], prefix="/insights")


async def _get_service(db=Depends(get_db), redis_client=Depends(get_redis)) -> AnalyticsService:
    return AnalyticsService(db, redis_client)


@router.get("/metrics")
async def get_operational_metrics(
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    service: AnalyticsService = Depends(_get_service),
) -> dict:
    metrics = await service.get_metrics(current_tenant.tenant_id)
    return {
        "orders_processed": metrics.orders_processed,
        "active_deliveries": metrics.active_deliveries,
        "high_risk_deliveries": metrics.high_risk_deliveries,
        "average_delay_minutes": metrics.average_delay_minutes,
        "agent_interventions": metrics.agent_interventions,
        "on_time_percentage": metrics.on_time_percentage,
    }


@router.get("/fleet-health")
async def get_fleet_health(
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    service: AnalyticsService = Depends(_get_service),
) -> dict:
    metrics = await service.get_metrics(current_tenant.tenant_id)
    status = "excellent"
    if metrics.fleet_health_score < 85:
        status = "healthy"
    if metrics.fleet_health_score < 70:
        status = "warning"
    if metrics.fleet_health_score < 50:
        status = "critical"
    # Compute simple delay trend: average delay in last 24h vs previous 24h
    try:
        recent = await service.db.execute(
            """
            SELECT COALESCE(AVG(GREATEST(EXTRACT(EPOCH FROM (COALESCE(actual_eta, NOW()) - planned_eta)) / 60.0, 0)), 0) AS avg_delay
            FROM orders
            WHERE tenant_id = :tenant_id
              AND created_at >= NOW() - INTERVAL '24 hours'
            """,
            {"tenant_id": current_tenant.tenant_id},
        )
        prev = await service.db.execute(
            """
            SELECT COALESCE(AVG(GREATEST(EXTRACT(EPOCH FROM (COALESCE(actual_eta, NOW()) - planned_eta)) / 60.0, 0)), 0) AS avg_delay
            FROM orders
            WHERE tenant_id = :tenant_id
              AND created_at >= NOW() - INTERVAL '48 hours'
              AND created_at < NOW() - INTERVAL '24 hours'
            """,
            {"tenant_id": current_tenant.tenant_id},
        )
        recent_row = recent.mappings().one()
        prev_row = prev.mappings().one()
        recent_avg = float(recent_row["avg_delay"] or 0.0)
        prev_avg = float(prev_row["avg_delay"] or 0.0)
        trend = recent_avg - prev_avg
    except Exception:
        trend = 0.0

    return {
        "score": metrics.fleet_health_score,
        "status": status,
        "on_time_rate": metrics.on_time_percentage,
        "delay_frequency": metrics.average_delay_minutes,
        "risk_distribution": metrics.high_risk_deliveries,
        "route_efficiency": metrics.prediction_accuracy,
        "intervention_frequency": metrics.agent_interventions,
        "trend": round(trend, 2),
    }


@router.get("/recommendations")
async def get_recommendations(
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    service: AnalyticsService = Depends(_get_service),
) -> list[dict]:
    return await service.get_recommendations(current_tenant.tenant_id)


@router.get("/delay-causes")
async def get_delay_causes(
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    service: AnalyticsService = Depends(_get_service),
) -> dict:
    return {"causes": await service.get_delay_causes(current_tenant.tenant_id)}
