"""
Orders router.
High-frequency GPS position updates and order management.
"""

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

import redis.asyncio as redis
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.auth import AuthenticatedTenant, get_current_tenant
from src.api.deps import get_db, get_redis
from src.api.rate_limit import check_rate_limit
from src.core.config import get_settings
from src.core.metrics import orders_created_total
from src.api.schemas import (
    CreateOrderRequest,
    OrderListResponse,
    OrderResponse,
    OrderStatus,
    PositionUpdateRequest,
    PositionUpdateResponse,
    RiskLevel,
)

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["orders"], prefix="/orders")


def _get_risk_level(risk_score: float) -> RiskLevel:
    """Convert risk score to risk level."""
    if risk_score < 0.30:
        return RiskLevel.LOW
    elif risk_score < 0.70:
        return RiskLevel.MEDIUM
    else:
        return RiskLevel.HIGH


async def _set_tenant_context(db: AsyncSession, tenant_id: str, request_id: str | None = None) -> None:
    # SQLite does not support set_config().
    # The connection binding tells us which dialect we are on.
    bind = db.get_bind()
    if bind and hasattr(bind, "dialect") and bind.dialect.name == "sqlite":
        return
    await db.execute(
        text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
        {"tenant_id": tenant_id},
    )
    if request_id:
        await db.execute(
            text("SELECT set_config('app.request_id', :request_id, true)"),
            {"request_id": request_id},
        )


def _seed_api_key_hash(tenant_id: str) -> str:
    return hashlib.sha256(tenant_id.encode("utf-8")).hexdigest()


@router.get("", response_model=OrderListResponse)
async def list_orders(
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis),
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
) -> OrderListResponse:
    """
    List active orders for tenant with pagination.

    Query params:
    - status: Filter by order status (optional)
    - page: Page number (default 1)
    - page_size: Items per page (default 20, max 100)
    """
    logger.info(
        "list_orders",
        tenant_id=current_tenant.tenant_id,
        page=page,
        page_size=page_size,
    )

    await _set_tenant_context(db, current_tenant.tenant_id)

    where_clause = "tenant_id = :tenant_id"
    params: dict[str, object] = {"tenant_id": current_tenant.tenant_id}
    if status_filter:
        where_clause += " AND status = :status_filter"
        params["status_filter"] = status_filter

    total_result = await db.execute(
        text(f"SELECT COUNT(*) AS total_count FROM orders WHERE {where_clause}"),
        params,
    )
    total_count = int(total_result.scalar() or 0)

    offset = (page - 1) * page_size
    params_with_paging = dict(params)
    params_with_paging.update({"limit": page_size, "offset": offset})

    result = await db.execute(
        text(
            f"""
            SELECT id, driver_id, status, planned_eta, actual_eta,
                   current_risk_score, planned_stops, completed_stops,
                   created_at, updated_at
            FROM orders
            WHERE {where_clause}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
            """
        ),
        params_with_paging,
    )

    items = []
    for row in result.mappings().all():
        redis_state = await redis_client.hgetall(f"order:{row['id']}")
        latitude = float(redis_state.get("latitude", 0.0))
        longitude = float(redis_state.get("longitude", 0.0))
        speed = float(redis_state.get("speed", 0.0))
        planned_stops = int(row["planned_stops"] or 1)
        completed_stops = int(row["completed_stops"] or 0)

        items.append(
            OrderResponse(
                orderId=str(row["id"]),
                driverId=str(row["driver_id"]),
                tenantId=current_tenant.tenant_id,
                status=OrderStatus.ACTIVE if row["status"] != "completed" else OrderStatus.COMPLETED,
                plannedEta=row["planned_eta"],
                currentEta=row["actual_eta"] or row["planned_eta"],
                currentRiskScore=float(row["current_risk_score"] or 0.0),
                riskLevel=_get_risk_level(float(row["current_risk_score"] or 0.0)),
                latitude=latitude,
                longitude=longitude,
                speed=speed,
                stopsRemaining=max(planned_stops - completed_stops, 0),
                createdAt=row["created_at"],
                updatedAt=row["updated_at"],
            )
        )

    return OrderListResponse(
        items=items,
        total_count=total_count,
        page=page,
        page_size=page_size,
        has_next=offset + page_size < total_count,
    )


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: str,
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis),
) -> OrderResponse:
    """
    Get order details with current state.
    Fetches latest GPS position and risk score from Redis.
    """
    logger.info(
        "get_order",
        order_id=order_id,
        tenant_id=current_tenant.tenant_id,
    )

    # Try Redis first for current state
    try:
        order_state = await redis_client.hgetall(f"order:{order_id}")
        if order_state:
            risk_score = float(order_state.get("risk_score", 0.5))
            planned_eta_str = order_state.get("planned_eta")
            planned_eta = datetime.fromisoformat(planned_eta_str) if planned_eta_str else datetime.now(timezone.utc)
            return OrderResponse(
                orderId=order_id,
                driverId=order_state.get("driver_id", "unknown"),
                tenantId=current_tenant.tenant_id,
                status=OrderStatus.ACTIVE,
                plannedEta=planned_eta,
                currentEta=planned_eta,
                currentRiskScore=risk_score,
                riskLevel=_get_risk_level(risk_score),
                latitude=float(order_state.get("latitude", 0.0)),
                longitude=float(order_state.get("longitude", 0.0)),
                speed=float(order_state.get("speed", 0.0)),
                stopsRemaining=int(order_state.get("stops_remaining", 0)),
                createdAt=datetime.now(timezone.utc),
                updatedAt=datetime.now(timezone.utc),
            )
    except Exception as e:
        logger.warning("redis_order_lookup_failed", error=str(e))

    # Fall back to database
    await _set_tenant_context(db, current_tenant.tenant_id)
    result = await db.execute(
        text("""
            SELECT id, driver_id, status, planned_eta, actual_eta,
                   current_risk_score, planned_stops, completed_stops,
                   created_at, updated_at
            FROM orders
            WHERE id = :order_id AND tenant_id = :tenant_id
        """),
        {"order_id": order_id, "tenant_id": current_tenant.tenant_id},
    )
    row = result.mappings().one_or_none()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order {order_id} not found",
        )

    latitude = 0.0
    longitude = 0.0
    speed = 0.0
    planned_stops = int(row["planned_stops"] or 1)
    completed_stops = int(row["completed_stops"] or 0)

    return OrderResponse(
        orderId=str(row["id"]),
        driverId=str(row["driver_id"]),
        tenantId=current_tenant.tenant_id,
        status=OrderStatus.ACTIVE if row["status"] != "completed" else OrderStatus.COMPLETED,
        plannedEta=row["planned_eta"],
        currentEta=row["actual_eta"] or row["planned_eta"],
        currentRiskScore=float(row["current_risk_score"] or 0.0),
        riskLevel=_get_risk_level(float(row["current_risk_score"] or 0.0)),
        latitude=latitude,
        longitude=longitude,
        speed=speed,
        stopsRemaining=max(planned_stops - completed_stops, 0),
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
    )


@router.post("", response_model=dict)
async def create_order(
    request: CreateOrderRequest,
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis),
) -> dict:
    """
    Create new order from flat frontend fields.

    Accepts driver_id, origin_lat/lng, destination_lat/lng, planned_eta.
    Generates order_id if omitted, builds internal stops array from lat/lng pairs.
    """
    order_id = request.order_id or str(uuid.uuid4())

    logger.info(
        "create_order",
        order_id=order_id,
        tenant_id=current_tenant.tenant_id,
        driver_id=request.driver_id,
    )

    if request.planned_eta < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="planned_eta must be in the future",
        )

    await _set_tenant_context(db, current_tenant.tenant_id)

    origin_stop = {
        "lat": request.origin_lat,
        "lng": request.origin_lng,
        "type": "origin",
        "sequence": 0,
    }
    destination_stop = {
        "lat": request.destination_lat,
        "lng": request.destination_lng,
        "type": "destination",
        "sequence": 1,
    }
    stops = [origin_stop, destination_stop]
    planned_stops = len(stops)

    await db.execute(
        text(
            """
            INSERT INTO drivers (id, tenant_id, name, historical_on_time_rate, total_deliveries)
            VALUES (:driver_id, :tenant_id, :name, 0.85, 0)
            ON CONFLICT (tenant_id, id) DO NOTHING
            """
        ),
        {
            "driver_id": request.driver_id,
            "tenant_id": current_tenant.tenant_id,
            "name": f"Driver {request.driver_id[:8]}",
        },
    )

    await db.execute(
        text(
            """
            INSERT INTO orders (
                id, tenant_id, driver_id, status, planned_stops, completed_stops,
                planned_eta, actual_eta, current_risk_score
            ) VALUES (
                :order_id, :tenant_id, :driver_id, 'pending', :planned_stops, 0,
                :planned_eta, NULL, 0.0
            )
            ON CONFLICT (tenant_id, id) DO UPDATE
            SET driver_id = EXCLUDED.driver_id,
                status = EXCLUDED.status,
                planned_stops = EXCLUDED.planned_stops,
                planned_eta = EXCLUDED.planned_eta,
                updated_at = CURRENT_TIMESTAMP
            """
        ),
        {
            "order_id": order_id,
            "tenant_id": current_tenant.tenant_id,
            "driver_id": request.driver_id,
            "planned_stops": planned_stops,
            "planned_eta": request.planned_eta,
        },
    )
    await db.commit()

    await redis_client.hset(
        f"order:{order_id}",
        mapping={
            "driver_id": request.driver_id,
            "tenant_id": current_tenant.tenant_id,
            "status": "pending",
            "risk_score": 0.0,
            "planned_stops": planned_stops,
            "stops": json.dumps(stops),
            "latitude": request.origin_lat,
            "longitude": request.origin_lng,
            "speed": 0.0,
        },
    )

    await redis_client.xadd(
        "orders",
        {
            "event": "order_created",
            "order_id": order_id,
            "driver_id": request.driver_id,
            "tenant_id": current_tenant.tenant_id,
        },
    )

    await redis_client.publish(
        f"tenant:{current_tenant.tenant_id}:events",
        json.dumps(
            {
                "type": "order_created",
                "order_id": order_id,
                "driver_id": request.driver_id,
                "tenant_id": current_tenant.tenant_id,
                "planned_eta": request.planned_eta.isoformat(),
                "risk_score": 0.0,
                "latitude": request.origin_lat,
                "longitude": request.origin_lng,
                "speed_kmh": 0.0,
                "stops": stops,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ),
    )

    orders_created_total.labels(tenant_id=current_tenant.tenant_id).inc()
    logger.info("order_created", order_id=order_id)

    return {
        "orderId": order_id,
        "status": "created",
        "message": "Order created and agent initialized",
    }


@router.patch(
    "/{order_id}/position",
    response_model=PositionUpdateResponse,
)
async def update_position(
    http_request: Request,
    order_id: str,
    request: PositionUpdateRequest,
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    redis_client: redis.Redis = Depends(get_redis),
) -> PositionUpdateResponse:
    """
    Ingest GPS position update (HIGH-FREQUENCY endpoint).

    Target: < 20ms response time.
    Writes to Redis for fast access.
    Publishes to Redis Streams for agent consumption.
    """
    # Rate limit high-frequency position updates
    settings = get_settings(allow_defaults=True)
    await check_rate_limit(http_request, settings.rate_limit_position_per_minute, key_prefix="position")

    # Get request_id from context (added by middleware)
    request_id = getattr(current_tenant, "request_id", "unknown")

    # Fast path: update Redis order state
    await redis_client.hset(
        f"order:{order_id}",
        mapping={
            "latitude": request.latitude,
            "longitude": request.longitude,
            "speed": request.speed_kmh,
            "heading": request.heading,
            "last_update": datetime.now(timezone.utc).isoformat(),
        },
    )

    # Get current risk score (or default)
    risk_score_str = await redis_client.hget(f"order:{order_id}", "risk_score")
    risk_score = float(risk_score_str) if risk_score_str else 0.5

    # Resolve driver_id for the agent graph (requires it to be non-empty)
    # It was stored in the Redis hash at order creation time.
    driver_id = await redis_client.hget(f"order:{order_id}", "driver_id") or ""

    # Publish to Redis Streams (agent will consume)
    await redis_client.xadd(
        "gps_pings",
        {
            "order_id": order_id,
            "tenant_id": current_tenant.tenant_id,
            "driver_id": driver_id,
            "latitude": str(request.latitude),
            "longitude": str(request.longitude),
            "speed_kmh": str(request.speed_kmh),
            "event_type": request.event_type,
        },
    )

    # Publish to pub/sub so WebSocket forwards position to frontend
    await redis_client.publish(
        f"tenant:{current_tenant.tenant_id}:events",
        json.dumps(
            {
                "type": "order_position_updated",
                "order_id": order_id,
                "lat": request.latitude,
                "lng": request.longitude,
                "speed": request.speed_kmh,
                "heading": request.heading,
                "risk_score": risk_score,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        ),
    )

    logger.info(
        "position_update_received",
        order_id=order_id,
        tenant_id=current_tenant.tenant_id,
        latency_ms=0,  # Would be measured by middleware
    )

    return PositionUpdateResponse(
        received=True,
        current_risk_score=risk_score,
        request_id=request_id,
    )


@router.get("/{order_id}/route", response_model=dict)
async def get_order_route(
    order_id: str,
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get current route for an order. Redirects internally to route data.
    """
    logger.info(
        "get_order_route",
        order_id=order_id,
        tenant_id=current_tenant.tenant_id,
    )
    result = await db.execute(
        text("""
            SELECT order_id::text, waypoints, total_distance_km, total_duration_minutes,
                   solver_status, created_at
            FROM route_plans
            WHERE tenant_id = :tenant_id AND order_id = :order_id
            ORDER BY created_at DESC
            LIMIT 1
        """),
        {"tenant_id": current_tenant.tenant_id, "order_id": order_id},
    )
    row = result.mappings().first()
    if not row:
        return {
            "order_id": order_id,
            "waypoints": [],
            "total_distance_km": 0.0,
            "total_duration_minutes": 0.0,
            "solver_status": "not_optimized",
        }

    waypoints_raw = row.get("waypoints") or []
    if isinstance(waypoints_raw, str):
        waypoints_raw = json.loads(waypoints_raw)

    return {
        "order_id": row["order_id"],
        "waypoints": waypoints_raw,
        "total_distance_km": float(row["total_distance_km"] or 0.0),
        "total_duration_minutes": float(row["total_duration_minutes"] or 0.0),
        "solver_status": str(row["solver_status"] or "unknown"),
        "route_optimized_at": row["created_at"].isoformat() if row.get("created_at") else None,
    }
