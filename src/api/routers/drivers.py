"""
Drivers router.
Driver information and fleet management.
"""

from typing import List

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text

from src.api.auth import AuthenticatedTenant, get_current_tenant
from src.api.deps import get_db, get_redis
from src.api.schemas import DriverResponse, DriverRiskSummaryResponse, DriverStatsResponse, RiskLevel

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["drivers"], prefix="/drivers")


def _risk_level(risk_score: float) -> RiskLevel:
    if risk_score < 0.3:
        return RiskLevel.LOW
    if risk_score < 0.7:
        return RiskLevel.MEDIUM
    return RiskLevel.HIGH


@router.get("", response_model=List[DriverResponse])
async def list_drivers(
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    db=Depends(get_db),
    redis_client=Depends(get_redis),
) -> List[DriverResponse]:
    """
    List all active drivers for tenant.

    Returns driver information including current location and active order count.
    """
    logger.info(
        "list_drivers",
        tenant_id=current_tenant.tenant_id,
    )

    result = await db.execute(
        text(
            """
            SELECT
                d.id::text AS driver_id,
                d.tenant_id::text AS tenant_id,
                COALESCE(d.name, 'Unknown') AS name,
                NULL::text AS phone,
                NULL::text AS email,
                TRUE AS is_active,
                gps.latitude AS current_latitude,
                gps.longitude AS current_longitude,
                COUNT(o.id) FILTER (WHERE o.status <> 'completed') AS active_order_count
            FROM drivers d
            LEFT JOIN orders o ON o.driver_id = d.id AND o.tenant_id = d.tenant_id
            LEFT JOIN LATERAL (
                SELECT ge.latitude, ge.longitude
                FROM gps_events ge
                WHERE ge.driver_id = d.id AND ge.tenant_id = d.tenant_id
                ORDER BY ge.recorded_at DESC
                LIMIT 1
            ) gps ON TRUE
            WHERE d.tenant_id = :tenant_id
            GROUP BY d.id, d.tenant_id, d.name, gps.latitude, gps.longitude
            ORDER BY active_order_count DESC, d.name ASC
            """
        ),
        {"tenant_id": current_tenant.tenant_id},
    )

    drivers = []
    for row in result.mappings().all():
        drivers.append(
            DriverResponse(
                driverId=row["driver_id"],
                tenantId=row["tenant_id"],
                name=row["name"],
                phone=row["phone"],
                email=row["email"],
                isActive=bool(row["is_active"]),
                currentLatitude=row["current_latitude"],
                currentLongitude=row["current_longitude"],
                activeOrderCount=int(row["active_order_count"] or 0),
            )
        )

    return drivers


@router.get("/{driver_id}", response_model=DriverResponse)
async def get_driver(
    driver_id: str,
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    db=Depends(get_db),
    redis_client=Depends(get_redis),
) -> DriverResponse:
    """
    Get driver details.

    Returns current location, active orders, and driver stats.
    """
    logger.info(
        "get_driver",
        driver_id=driver_id,
        tenant_id=current_tenant.tenant_id,
    )

    result = await db.execute(
        text(
            """
            SELECT
                d.id::text AS driver_id,
                d.tenant_id::text AS tenant_id,
                COALESCE(d.name, 'Unknown') AS name,
                NULL::text AS phone,
                NULL::text AS email,
                TRUE AS is_active,
                gps.latitude AS current_latitude,
                gps.longitude AS current_longitude,
                COUNT(o.id) FILTER (WHERE o.status <> 'completed') AS active_order_count
            FROM drivers d
            LEFT JOIN orders o ON o.driver_id = d.id AND o.tenant_id = d.tenant_id
            LEFT JOIN LATERAL (
                SELECT ge.latitude, ge.longitude
                FROM gps_events ge
                WHERE ge.driver_id = d.id AND ge.tenant_id = d.tenant_id
                ORDER BY ge.recorded_at DESC
                LIMIT 1
            ) gps ON TRUE
            WHERE d.tenant_id = :tenant_id AND d.id::text = :driver_id
            GROUP BY d.id, d.tenant_id, d.name, gps.latitude, gps.longitude
            LIMIT 1
            """
        ),
        {"tenant_id": current_tenant.tenant_id, "driver_id": driver_id},
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Driver {driver_id} not found")

    return DriverResponse(
        driverId=row["driver_id"],
        tenantId=row["tenant_id"],
        name=row["name"],
        phone=row["phone"],
        email=row["email"],
        isActive=bool(row["is_active"]),
        currentLatitude=row["current_latitude"],
        currentLongitude=row["current_longitude"],
        activeOrderCount=int(row["active_order_count"] or 0),
    )


@router.get("/{driver_id}/stats", response_model=DriverStatsResponse)
async def get_driver_stats(
    driver_id: str,
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    db=Depends(get_db),
) -> DriverStatsResponse:
    result = await db.execute(
        text(
            """
            SELECT
                d.id::text AS driver_id,
                d.tenant_id::text AS tenant_id,
                COUNT(o.id) FILTER (WHERE o.status <> 'completed') AS active_order_count,
                COUNT(o.id) FILTER (WHERE o.status = 'completed' AND o.actual_eta::date = CURRENT_DATE) AS completed_orders_today,
                COALESCE(d.total_deliveries, 0) AS total_deliveries,
                COALESCE(d.historical_on_time_rate, 0.0) AS on_time_rate,
                COALESCE(AVG(p.risk_score), 0.0) AS avg_risk_score
            FROM drivers d
            LEFT JOIN orders o ON o.driver_id = d.id AND o.tenant_id = d.tenant_id
            LEFT JOIN LATERAL (
                SELECT pred.risk_score
                FROM predictions pred
                WHERE pred.order_id = o.id AND pred.tenant_id = :tenant_id
                ORDER BY pred.created_at DESC
                LIMIT 1
            ) p ON TRUE
            WHERE d.tenant_id = :tenant_id AND d.id::text = :driver_id
            GROUP BY d.id, d.tenant_id, d.total_deliveries, d.historical_on_time_rate
            LIMIT 1
            """
        ),
        {"tenant_id": current_tenant.tenant_id, "driver_id": driver_id},
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Driver {driver_id} not found")

    avg_risk = float(row["avg_risk_score"] or 0.0)
    return DriverStatsResponse(
        driverId=row["driver_id"],
        tenantId=row["tenant_id"],
        activeOrderCount=int(row["active_order_count"] or 0),
        completedOrdersToday=int(row["completed_orders_today"] or 0),
        totalDeliveries=int(row["total_deliveries"] or 0),
        onTimeRate=float(row["on_time_rate"] or 0.0),
        avgRiskScore=avg_risk,
        riskLevel=_risk_level(avg_risk),
    )


@router.get("/risk/summary", response_model=DriverRiskSummaryResponse)
async def get_driver_risk_summary(
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    db=Depends(get_db),
) -> DriverRiskSummaryResponse:
    result = await db.execute(
        text(
            """
            SELECT
                d.id::text AS driver_id,
                COALESCE(d.name, 'Unknown') AS name,
                COALESCE(AVG(p.risk_score), 0.0) AS avg_risk_score
            FROM drivers d
            LEFT JOIN orders o ON o.driver_id = d.id AND o.tenant_id = d.tenant_id
            LEFT JOIN LATERAL (
                SELECT pred.risk_score
                FROM predictions pred
                WHERE pred.order_id = o.id AND pred.tenant_id = :tenant_id
                ORDER BY pred.created_at DESC
                LIMIT 1
            ) p ON TRUE
            WHERE d.tenant_id = :tenant_id
            GROUP BY d.id, d.name
            ORDER BY avg_risk_score DESC
            """
        ),
        {"tenant_id": current_tenant.tenant_id},
    )
    rows = result.mappings().all()
    total = len(rows)
    high = len([row for row in rows if float(row["avg_risk_score"] or 0.0) >= 0.7])
    medium = len([row for row in rows if 0.4 <= float(row["avg_risk_score"] or 0.0) < 0.7])
    low = total - high - medium
    return DriverRiskSummaryResponse(
        totalDrivers=total,
        highRiskDrivers=high,
        mediumRiskDrivers=medium,
        lowRiskDrivers=low,
        topDrivers=[
            {
                "driver_id": row["driver_id"],
                "name": row["name"],
                "avg_risk_score": float(row["avg_risk_score"] or 0.0),
                "risk_level": _risk_level(float(row["avg_risk_score"] or 0.0)).value,
            }
            for row in rows[:10]
        ],
    )
