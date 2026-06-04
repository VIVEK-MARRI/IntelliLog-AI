"""
Route optimization router.
Non-blocking async job submission and status polling.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text

from src.api.auth import AuthenticatedTenant, get_current_tenant
from src.api.deps import get_db, get_optimization_service, get_redis
from src.api.schemas import (
    JobStatusEnum,
    JobStatusResponse,
    OptimizeRouteRequest,
    OptimizeRouteResponse,
    RouteResponse,
    Waypoint,
)
logger = structlog.get_logger(__name__)

router = APIRouter(tags=["routes"], prefix="/routes")


def _waypoints_from_stops(stops: list[dict[str, Any]]) -> list[Waypoint]:
    return [
        Waypoint(
            stopId=str(stop.get("stop_id") or stop.get("id") or index),
            latitude=float(stop["lat"]),
            longitude=float(stop["lng"]),
            sequence=index,
            serviceDurationMinutes=float(stop.get("service_time_minutes", 3.0)),
            address=stop.get("address"),
            customerName=stop.get("customer_name"),
        )
        for index, stop in enumerate(stops, start=1)
    ]


async def _load_order_stops(redis_client: Any, order_id: str) -> tuple[tuple[float, float], list[dict[str, Any]]]:
    order_state = await redis_client.hgetall(f"order:{order_id}")
    if not order_state:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Order {order_id} not found")

    stops_raw = order_state.get("stops")
    if not stops_raw:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Order {order_id} has no route stops available")

    try:
        stops = json.loads(stops_raw)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Invalid route stop payload") from exc

    origin = (
        float(order_state.get("latitude", 0.0)),
        float(order_state.get("longitude", 0.0)),
    )
    return origin, stops


@router.post("/optimize", response_model=OptimizeRouteResponse)
async def optimize_route(
    request: OptimizeRouteRequest,
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    optimization_service: OptimizationService = Depends(
        get_optimization_service
    ),
    redis_client: Any = Depends(get_redis),
) -> OptimizeRouteResponse:
    """
    Submit async route optimization job.

    Returns immediately with job_id (< 10ms).
    Client polls /routes/jobs/{job_id} for status and result.

    This is the KEY NON-BLOCKING ENDPOINT:
    - Submits job to Celery queue
    - Returns job_id immediately
    - Solver runs in background worker (200-2000ms)
    - Client retrieves result later
    """
    logger.info(
        "optimize_route_request",
        order_id=request.orderId,
        tenant_id=current_tenant.tenant_id,
        force_reroute=request.forceReroute,
    )

    from src.optimization.solver import RoutingProblem, RoutingStop

    origin, stops_payload = await _load_order_stops(redis_client, request.orderId)

    problem = RoutingProblem(
        origin=origin,
        stops=[
            RoutingStop(
                stop_id=str(stop.get("stop_id") or stop.get("id") or index),
                lat=float(stop["lat"]),
                lng=float(stop["lng"]),
                demand=int(stop.get("demand", 1)),
                service_time_minutes=float(stop.get("service_time_minutes", 3.0)),
            )
            for index, stop in enumerate(stops_payload, start=1)
        ],
    )

    # Submit job (returns immediately with job_id)
    job_id = await optimization_service.submit_job(
        order_id=request.orderId,
        tenant_id=current_tenant.tenant_id,
        problem=problem,
    )

    logger.info(
        "optimize_route_submitted",
        job_id=job_id,
        order_id=request.orderId,
    )

    return OptimizeRouteResponse(
        jobId=job_id,
        status="submitted",
        pollUrl=f"/api/v1/routes/jobs/{job_id}",
    )


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(
    job_id: str,
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    optimization_service: OptimizationService = Depends(
        get_optimization_service
    ),
) -> JobStatusResponse:
    """
    Poll job status and retrieve result when completed.

    Returns:
    - status: pending, running, completed, or failed
    - result: RouteResponse (when status=completed)
    - error: Error message (when status=failed)
    """
    logger.info(
        "get_job_status",
        job_id=job_id,
        tenant_id=current_tenant.tenant_id,
    )

    status_obj = await optimization_service.get_job_status(job_id)

    if status_obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found",
        )

    # Convert to response
    result_response = None
    if status_obj.result:
        origin, stops_payload = await _load_order_stops(optimization_service.redis_client, status_obj.order_id)
        result_waypoints = _waypoints_from_stops(stops_payload)
        result_response = RouteResponse(
            orderId=status_obj.order_id,
            waypoints=result_waypoints,
            totalDistanceKm=status_obj.result.total_distance_km,
            totalDurationMinutes=status_obj.result.total_duration_minutes,
            currentWaypointSequence=0,
            routeOptimizedAt=status_obj.completed_at or datetime.now(timezone.utc),
            solverStatus=status_obj.result.solver_status,
        )

    return JobStatusResponse(
        jobId=job_id,
        orderId=status_obj.order_id,
        status=JobStatusEnum(status_obj.status.lower()),
        submittedAt=status_obj.submitted_at,
        startedAt=status_obj.started_at,
        completedAt=status_obj.completed_at,
        result=result_response,
        error=status_obj.error,
        durationMs=(
            int(
                (
                    status_obj.completed_at - status_obj.submitted_at
                ).total_seconds()
                * 1000
            )
            if status_obj.completed_at
            else None
        ),
    )


@router.get("/{order_id}/current", response_model=RouteResponse)
async def get_current_route(
    order_id: str,
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    db=Depends(get_db),
) -> RouteResponse:
    """
    Get current route for an order.

    Returns the latest optimized route plan with waypoints.
    """
    logger.info(
        "get_current_route",
        order_id=order_id,
        tenant_id=current_tenant.tenant_id,
    )

    result = await db.execute(
        text(
            """
            SELECT order_id::text AS order_id, waypoints, total_distance_km, total_duration_minutes,
                   solver_status, created_at
            FROM route_plans
            WHERE tenant_id = :tenant_id AND order_id = :order_id
            ORDER BY created_at DESC
            LIMIT 1
            """
        ),
        {"tenant_id": current_tenant.tenant_id, "order_id": order_id},
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Route plan for order {order_id} not found")

    waypoints_raw = row["waypoints"] or []
    if isinstance(waypoints_raw, str):
        waypoints_raw = json.loads(waypoints_raw)

    return RouteResponse(
        orderId=row["order_id"],
        waypoints=_waypoints_from_stops(waypoints_raw),
        totalDistanceKm=float(row["total_distance_km"] or 0.0),
        totalDurationMinutes=float(row["total_duration_minutes"] or 0.0),
        currentWaypointSequence=0,
        routeOptimizedAt=row["created_at"] or datetime.now(timezone.utc),
        solverStatus=str(row["solver_status"] or "unknown"),
    )


@router.get("/{order_id}/history")
async def get_route_history(
    order_id: str,
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    db=Depends(get_db),
) -> list[dict[str, Any]]:
    result = await db.execute(
        text(
            """
            SELECT id::text AS route_plan_id, order_id::text AS order_id, created_at, waypoints,
                   total_distance_km, total_duration_minutes, solver_status, solver_duration_ms
            FROM route_plans
            WHERE tenant_id = :tenant_id AND order_id = :order_id
            ORDER BY created_at DESC
            LIMIT 20
            """
        ),
        {"tenant_id": current_tenant.tenant_id, "order_id": order_id},
    )
    return [dict(row) for row in result.mappings().all()]
