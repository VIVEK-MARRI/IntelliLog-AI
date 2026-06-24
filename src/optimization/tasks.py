"""
Celery Tasks - Background jobs for route optimization.

These tasks run in worker processes, never blocking the API thread.
Updates job status in Redis throughout execution.
Publishes completion events to Redis pub/sub for real-time updates.
"""

import json
import os
from datetime import datetime, timezone
from typing import Optional

import structlog
from celery import Celery, shared_task
from celery.exceptions import SoftTimeLimitExceeded
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from src.core.config import get_settings
from src.optimization.solver import (
    RoutingProblem,
    RoutingStop,
    VRPSolver,
)
from src.optimization.service import OptimizationService, JobStatus
from src.db.redis_schema import get_shipment_updates_channel

logger = structlog.get_logger(__name__)

_settings = get_settings(allow_defaults=True)

# Initialize Celery app
celery_app = Celery(
    "intelliglog",
    broker=_settings.celery_broker_url or _settings.redis_url or "redis://localhost:6379/0",
)
celery_app.conf.result_backend = _settings.celery_result_backend or _settings.redis_url or "redis://localhost:6379/0"


@celery_app.task(
    bind=True,
    max_retries=2,
    soft_time_limit=8,  # 8 seconds soft limit (sends SoftTimeLimitExceeded)
    time_limit=10,  # 10 seconds hard limit (kills worker)
    track_started=True,
)
def solve_routing_job(
    self,
    job_id: str,
    order_id: str,
    tenant_id: str,
    problem_dict: dict,
) -> dict:
    """
    Celery task that runs the VRP solver.

    Flow:
    1. Update Redis status to "running"
    2. Deserialize problem from dict
    3. Run solver
    4. Save RoutingResult to PostgreSQL route_plans table
    5. Update Redis status to "completed" with result
    6. Publish event to Redis pub/sub: tenant:{tenant_id}:events

    Args:
        self: Celery task self (for retries)
        job_id: Unique job identifier
        order_id: Order ID being optimized
        tenant_id: Tenant ID
        problem_dict: Serialized RoutingProblem

    Returns:
        Result dict with status and result

    Raises:
        Retries up to max_retries on any exception
    """
    import redis

    redis_client = redis.Redis.from_url(_settings.redis_url or "redis://localhost:6379/0", decode_responses=True)
    solver = VRPSolver(timeout_seconds=5)
    db_url = _settings.database_url or os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError(
            "DATABASE_URL is not configured. "
            "This is a security-critical setting that must be provided via environment variable."
        )

    try:
        # ===== STEP 1: Update status to "running" =====
        logger.info("solver_task_started", job_id=job_id, order_id=order_id)
        redis_key = f"optimization:job:{job_id}"
        redis_client.hset(
            redis_key,
            mapping={
                "status": JobStatus.RUNNING.value,
                "started_at": datetime.now(timezone.utc).isoformat(),
            },
        )

        # ===== STEP 2: Deserialize problem =====
        stops = [
            RoutingStop(
                stop_id=s["stop_id"],
                lat=s["lat"],
                lng=s["lng"],
                demand=s.get("demand", 1),
                service_time_minutes=s.get("service_time_minutes", 3.0),
            )
            for s in problem_dict["stops"]
        ]

        problem = RoutingProblem(
            origin=tuple(problem_dict["origin"]),
            stops=stops,
            vehicle_capacity=problem_dict.get("vehicle_capacity"),
        )

        # ===== STEP 3: Run solver =====
        logger.info("solver_executing", job_id=job_id, num_stops=len(stops))
        result = solver.solve(problem)
        logger.info(
            "solver_completed",
            job_id=job_id,
            status=result.solver_status,
            duration_ms=result.solver_duration_ms,
            time_saved_minutes=result.time_saved_minutes,
        )

        # ===== STEP 4: Save to PostgreSQL (sync) =====
        # Use synchronous SQLAlchemy — Celery workers are sync, so
        # asyncio.run() would crash with "already running event loop".
        sync_db_url = _settings.database_url or os.getenv("DATABASE_URL")
        if not sync_db_url:
            raise RuntimeError(
                "DATABASE_URL is not configured. "
                "This is a security-critical setting that must be provided via environment variable."
            )
        sync_db_url = sync_db_url.replace("+asyncpg", "+psycopg2")
        from sqlalchemy import create_engine
        from sqlalchemy.orm import Session as SyncSession
        sync_engine = create_engine(sync_db_url)
        try:
            with SyncSession(sync_engine) as db:
                db.execute(
                    text(
                        """
                        INSERT INTO route_plans (
                            id, order_id, tenant_id, waypoints, total_distance_km,
                            total_duration_minutes, solver_status, solver_duration_ms, created_at
                        ) VALUES (
                            gen_random_uuid(), :order_id, :tenant_id, :waypoints, :total_distance_km,
                            :total_duration_minutes, :solver_status, :solver_duration_ms, NOW()
                        )
                        """
                    ),
                    {
                        "order_id": order_id,
                        "tenant_id": tenant_id,
                        "waypoints": json.dumps(result.ordered_stops),
                        "total_distance_km": result.total_distance_km,
                        "total_duration_minutes": result.total_duration_minutes,
                        "solver_status": result.solver_status,
                        "solver_duration_ms": result.solver_duration_ms,
                    },
                )
                db.commit()
        except Exception as db_err:
            logger.warning(
                "solver_db_save_skipped",
                job_id=job_id,
                order_id=order_id,
                error=str(db_err),
            )

        # ===== STEP 5: Update Redis status to "completed" =====
        # Build proper waypoints with lat/lng from ordered stop IDs
        stop_lookup = {s["stop_id"]: s for s in problem_dict["stops"]}
        waypoints = []
        for seq, stop_id in enumerate(result.ordered_stops, start=1):
            orig = stop_lookup.get(stop_id, {})
            waypoints.append({
                "lat": orig.get("lat", 0.0),
                "lng": orig.get("lng", 0.0),
                "order_id": order_id,
                "sequence": seq,
                "type": "stop",
            })

        result_dict = {
            "ordered_stops": json.dumps(result.ordered_stops),
            "total_distance_km": str(result.total_distance_km),
            "total_duration_minutes": str(result.total_duration_minutes),
            "time_saved_minutes": str(result.time_saved_minutes),
            "solver_status": result.solver_status,
            "solver_duration_ms": str(result.solver_duration_ms),
        }

        redis_client.hset(
            redis_key,
            mapping={
                "status": JobStatus.COMPLETED.value,
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "result": json.dumps(result_dict),
            },
        )

        logger.info(
            "solver_task_completed",
            job_id=job_id,
            order_id=order_id,
            status=result.solver_status,
        )

        # ===== STEP 6: Publish event to Redis pub/sub =====
        channel = f"tenant:{tenant_id}:events"
        event_payload = {
            "type": "route_updated",
            "job_id": job_id,
            "order_id": order_id,
            "new_waypoints": waypoints,
            "time_saved_minutes": result.time_saved_minutes,
            "result": result_dict,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        redis_client.publish(channel, json.dumps(event_payload))
        redis_client.publish(
            get_shipment_updates_channel(),
            json.dumps(
                {
                    "type": "shipment_updated",
                    "job_id": job_id,
                    "order_id": order_id,
                    "tenant_id": tenant_id,
                    "result": result_dict,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            ),
        )
        logger.info("event_published", channel=channel, job_id=job_id)

        return {
            "status": "success",
            "job_id": job_id,
            "result": result_dict,
        }

    except SoftTimeLimitExceeded as e:
        # Task exceeded soft time limit (will be killed)
        logger.error(
            "solver_task_timeout",
            job_id=job_id,
            order_id=order_id,
            error="SoftTimeLimitExceeded",
        )

        redis_client.hset(
            redis_key,
            mapping={
                "status": JobStatus.FAILED.value,
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "error": "Solver timeout (exceeded 8 seconds)",
            },
        )

        # Publish failure event
        channel = f"tenant:{tenant_id}:events"
        event_payload = {
            "type": "route_optimization_failed",
            "job_id": job_id,
            "order_id": order_id,
            "error": "Timeout",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        redis_client.publish(channel, json.dumps(event_payload))
        redis_client.publish(
            get_shipment_updates_channel(),
            json.dumps(
                {
                    "type": "shipment_update_failed",
                    "job_id": job_id,
                    "order_id": order_id,
                    "tenant_id": tenant_id,
                    "error": "Timeout",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            ),
        )

        raise

    except Exception as e:
        # Any other exception
        logger.error(
            "solver_task_error",
            job_id=job_id,
            order_id=order_id,
            error=str(e),
            exception_type=type(e).__name__,
        )

        redis_key = f"optimization:job:{job_id}"
        redis_client.hset(
            redis_key,
            mapping={
                "status": JobStatus.FAILED.value,
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "error": str(e),
            },
        )

        # Publish failure event
        channel = f"tenant:{tenant_id}:events"
        event_payload = {
            "type": "route_optimization_failed",
            "job_id": job_id,
            "order_id": order_id,
            "error": str(e),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        redis_client.publish(channel, json.dumps(event_payload))
        redis_client.publish(
            get_shipment_updates_channel(),
            json.dumps(
                {
                    "type": "shipment_update_failed",
                    "job_id": job_id,
                    "order_id": order_id,
                    "tenant_id": tenant_id,
                    "error": str(e),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            ),
        )

        # Retry with exponential backoff
        raise self.retry(exc=e, countdown=2 ** self.request.retries)


# Celery exception handler (for soft time limit)
