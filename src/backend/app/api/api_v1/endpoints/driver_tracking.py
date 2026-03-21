"""Driver position tracking endpoints."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from prometheus_client import Counter

from src.backend.app.api import deps
from src.backend.app.schemas.tracking import (
    DriverPositionUpdate,
    NearbyDriversResponse,
    PositionUpdateResponse,
    NearbyDriver,
)
from src.backend.app.services.tracking_service import get_geo_tracker, RedisGeoTracker
from src.backend.app.services.deviation_detection import DeviationDetector

logger = logging.getLogger(__name__)

# Prometheus metric for rate limiter fail-open events
rate_limit_redis_failures = Counter(
    'rate_limit_redis_failures_total',
    'Times rate limiter fell back to fail-open due to Redis error',
    ['driver_id']
)

router = APIRouter(prefix="/driver", tags=["driver-tracking"])


def _enforce_position_rate_limit(tracker: RedisGeoTracker, driver_id: str) -> None:
    """Rate limit: max 12 position updates per minute per driver.
    
    Fails open on Redis error: GPS data is more important than rate limiting.
    If Redis is unavailable, position updates are allowed.
    """
    try:
        rate_key = f"rate:{driver_id}:pos_updates"
        count = tracker.redis.incr(rate_key)
        if count == 1:
            tracker.redis.expire(rate_key, 60)
        if count > 12:
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "rate_limit_exceeded",
                    "retry_after_seconds": 5,
                    "message": "Maximum 12 position updates per minute"
                },
                headers={"Retry-After": "5"}
            )
    except HTTPException:
        # Always re-raise HTTP exceptions (these are intentional)
        raise
    except Exception:
        # Fail open: Redis down means no rate limiting, not no GPS data
        logger.warning(
            "Rate limiter Redis unavailable for driver %s - allowing update",
            driver_id
        )
        rate_limit_redis_failures.labels(driver_id=driver_id).inc()


@router.post("/position", response_model=PositionUpdateResponse)
async def update_driver_position(
    position: DriverPositionUpdate,
    tracker: RedisGeoTracker = Depends(get_geo_tracker),
    tenant_id: str = Depends(deps.get_current_tenant),
) -> PositionUpdateResponse:
    """
    Receive driver GPS position update.
    
    Stores position in Redis Geo, publishes to WebSocket subscribers, and checks for route deviation.
    """
    # Validate timestamp is recent (within 30 seconds).
    # Accept both naive and timezone-aware inputs by normalizing to UTC.
    position_timestamp = position.timestamp
    if position_timestamp.tzinfo is None:
        position_timestamp = position_timestamp.replace(tzinfo=timezone.utc)

    time_diff = (datetime.now(timezone.utc) - position_timestamp).total_seconds()
    if time_diff > 30:
        raise HTTPException(
            status_code=400,
            detail=f"Position timestamp is {time_diff:.0f}s old (max 30s)",
        )

    if time_diff < -5:  # Allow 5s clock skew
        raise HTTPException(
            status_code=400,
            detail="Position timestamp is in the future",
        )

    _enforce_position_rate_limit(tracker, position.driver_id)

    # Store position in Redis
    stored = tracker.store_position(tenant_id, position)
    if not stored:
        raise HTTPException(status_code=500, detail="Failed to store position")

    # Publish to Redis pub/sub
    tracker.publish_position_update(tenant_id, position)

    # Check for route deviation (simplified check here, full logic in background task)
    deviation_detected = False
    reoptimize_triggered = False

    # Get driver's current route
    current_route = tracker.get_driver_current_route(position.driver_id)
    if current_route:
        route_geometry = tracker.get_route_geometry(current_route)
        if route_geometry:
            detector = DeviationDetector()
            current_pos = (position.latitude, position.longitude)
            deviation_count = tracker.increment_deviation_count(position.driver_id)

            is_deviated, distance_m, new_count = detector.check_deviation(
                current_pos, route_geometry, deviation_count - 1
            )

            if is_deviated:
                deviation_detected = True
                tracker.set_driver_deviation(position.driver_id, True)
                reoptimize_triggered = True
                logger.warning(
                    f"Deviation detected for driver {position.driver_id}: "
                    f"{distance_m:.1f}m from route"
                )
                # TODO: Trigger Celery re-routing task
            elif distance_m < 200:  # Recovery threshold
                tracker.reset_deviation_count(position.driver_id)
                tracker.set_driver_deviation(position.driver_id, False)

    return PositionUpdateResponse(
        received=True,
        deviation_detected=deviation_detected,
        reoptimize_triggered=reoptimize_triggered,
    )


@router.get("/nearby", response_model=NearbyDriversResponse)
async def find_nearby_drivers(
    lat: float = Query(..., ge=-90, le=90, description="Search latitude"),
    lon: float = Query(..., ge=-180, le=180, description="Search longitude"),
    radius_km: float = Query(5.0, ge=0.1, le=100, description="Search radius in km"),
    tracker: RedisGeoTracker = Depends(get_geo_tracker),
    tenant_id: str = Depends(deps.get_current_tenant),
) -> NearbyDriversResponse:
    """
    Find drivers within specified radius using Redis GEORADIUS.
    
    Only returns drivers with position updates within last 60 seconds.
    """
    drivers = tracker.find_nearby_drivers(tenant_id, lat, lon, radius_km)

    return NearbyDriversResponse(
        drivers=[NearbyDriver(**d) for d in drivers],
        total_count=len(drivers),
    )


@router.get("/status/{driver_id}")
async def get_driver_status(
    driver_id: str,
    tracker: RedisGeoTracker = Depends(get_geo_tracker),
    tenant_id: str = Depends(deps.get_current_tenant),
):
    """Get current status of a specific driver."""
    position = tracker.get_driver_position(driver_id)
    if not position:
        raise HTTPException(status_code=404, detail="Driver not found or offline")

    deviation = tracker.get_driver_deviation(driver_id)
    current_route = tracker.get_driver_current_route(driver_id)

    return {
        **position,
        "on_route": not deviation,
        "current_route": current_route,
        "deviation_flag": deviation,
    }


@router.post("/position/batch")
async def batch_update_positions(
    positions: list[DriverPositionUpdate],
    tracker: RedisGeoTracker = Depends(get_geo_tracker),
    tenant_id: str = Depends(deps.get_current_tenant),
):
    """
    Batch update multiple driver positions (for fleet optimization).
    """
    results = []

    for position in positions:
        try:
            stored = tracker.store_position(tenant_id, position)
            tracker.publish_position_update(tenant_id, position)
            results.append({
                "driver_id": position.driver_id,
                "received": stored,
            })
        except Exception as e:
            logger.error(f"Failed to store batch position: {e}")
            results.append({
                "driver_id": position.driver_id,
                "received": False,
                "error": str(e),
            })

    return {"results": results, "total": len(results), "successful": sum(1 for r in results if r["received"])}
