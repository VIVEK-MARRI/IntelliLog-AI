"""
Optimization Service - Async job management for route optimization.

This service manages the async optimization workflow:
1. Client submits routing job (non-blocking)
2. Job stored in Redis with status=pending
3. Celery worker picks up job
4. Worker runs solver, saves result, publishes event
5. Client polls or receives WebSocket push

Key principle: Never block the API thread.
All I/O operations are async (Redis, database queries).
"""

import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

import redis.asyncio as redis
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.optimization.solver import RoutingProblem, RoutingResult, VRPSolver

logger = structlog.get_logger(__name__)


class JobStatus(str, Enum):
    """Status of an optimization job."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class JobMetadata:
    """Metadata for an optimization job."""

    job_id: str
    order_id: str
    tenant_id: str
    status: JobStatus
    submitted_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    result: Optional[RoutingResult] = None
    error: Optional[str] = None


class OptimizationService:
    """
    Async service for managing route optimization jobs.

    Uses Celery for background execution and Redis for state management.
    """

    def __init__(self, redis_client: redis.Redis, celery_app=None):
        """
        Initialize the optimization service.

        Args:
            redis_client: Redis async client
            celery_app: Celery app instance (for submitting jobs)
        """
        self.redis_client = redis_client
        self.celery_app = celery_app
        self.solver = VRPSolver(timeout_seconds=5)

    async def submit_job(
        self,
        order_id: str,
        tenant_id: str,
        problem: RoutingProblem,
    ) -> str:
        """
        Submit a routing job.

        Stores job metadata in Redis with status=pending, then runs the solver
        in a background asyncio task. Returns immediately with job_id.

        If Celery worker is available, enqueues via Celery instead.
        Falls back to inline background execution for dev/demo mode.

        Args:
            order_id: Order ID
            tenant_id: Tenant ID
            problem: RoutingProblem to solve

        Returns:
            job_id (UUID string)

        Total time: < 10ms (all in-memory operations)
        """
        job_id = str(uuid.uuid4())

        # Create job metadata
        metadata = JobMetadata(
            job_id=job_id,
            order_id=order_id,
            tenant_id=tenant_id,
            status=JobStatus.PENDING,
            submitted_at=datetime.now(timezone.utc),
        )

        # Store in Redis (non-blocking)
        redis_key = f"optimization:job:{job_id}"
        metadata_dict = {
            "job_id": metadata.job_id,
            "order_id": metadata.order_id,
            "tenant_id": metadata.tenant_id,
            "status": metadata.status.value,
            "submitted_at": metadata.submitted_at.isoformat(),
        }

        await self.redis_client.hset(redis_key, mapping=metadata_dict)
        await self.redis_client.expire(redis_key, 86400)  # 24-hour TTL

        # Submit to Celery if available
        if self.celery_app:
            # Import here to avoid circular dependency
            from src.optimization.tasks import solve_routing_job

            # Convert problem to dict for Celery
            problem_dict = {
                "origin": problem.origin,
                "stops": [
                    {
                        "stop_id": s.stop_id,
                        "lat": s.lat,
                        "lng": s.lng,
                        "demand": s.demand,
                        "service_time_minutes": s.service_time_minutes,
                    }
                    for s in problem.stops
                ],
                "vehicle_capacity": problem.vehicle_capacity,
            }

            logger.info(
                "job_enqueue_start",
                job_id=job_id,
                broker_url=str(getattr(self.celery_app.conf, "broker_url", "unknown")),
                result_backend=str(getattr(self.celery_app.conf, "result_backend", "unknown")),
            )

            async_result = solve_routing_job.delay(job_id, order_id, tenant_id, problem_dict)

            logger.info(
                "job_enqueue_complete",
                job_id=job_id,
                task_id=async_result.id,
            )

            await self.redis_client.hset(
                redis_key,
                mapping={
                    "task_id": async_result.id,
                    "queue_name": "celery",
                },
            )

        # Run solver inline only if Celery is unavailable.
        # When Celery is configured, the dispatched Celery task is the sole
        # execution path — this avoids the dual-execution race.
        if not self.celery_app or not getattr(self.celery_app.conf, "broker_url", None):
            import asyncio
            asyncio.create_task(self._execute_job(job_id, redis_key, problem, order_id, tenant_id))

        logger.info(
            "job_submitted",
            job_id=job_id,
            order_id=order_id,
            tenant_id=tenant_id,
            num_stops=len(problem.stops),
        )

        return job_id

    async def _execute_job(self, job_id: str, redis_key: str, problem: RoutingProblem, order_id: str, tenant_id: str) -> None:
        """Execute solver inline as a background task, save to DB, and publish event."""
        import json
        import asyncio
        from src.db.redis_schema import get_shipment_updates_channel
        from sqlalchemy import text
        from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
        from sqlalchemy.orm import sessionmaker
        from src.core.config import get_settings

        db_url = get_settings(allow_defaults=True).database_url
        if not db_url:
            raise RuntimeError(
                "DATABASE_URL is not configured. "
                "This is a security-critical setting that must be provided via environment variable."
            )

        try:
            await self.redis_client.hset(redis_key, mapping={"status": JobStatus.RUNNING.value, "started_at": datetime.now(timezone.utc).isoformat()})

            result = await asyncio.to_thread(self.solver.solve, problem)

            result_dict = {
                "ordered_stops": result.ordered_stops,
                "total_distance_km": result.total_distance_km,
                "total_duration_minutes": result.total_duration_minutes,
                "time_saved_minutes": result.time_saved_minutes,
                "solver_status": result.solver_status,
                "solver_duration_ms": result.solver_duration_ms,
            }

            # Build waypoints for event and DB
            stop_lookup = {s.stop_id: s for s in problem.stops}
            waypoints = []
            for seq, stop_id in enumerate(result.ordered_stops, start=1):
                orig = stop_lookup.get(stop_id)
                if orig:
                    waypoints.append({
                        "lat": orig.lat, "lng": orig.lng,
                        "order_id": getattr(orig, 'order_id', None),
                        "sequence": seq, "type": "stop",
                    })

            # Save to PostgreSQL route_plans table
            try:
                engine = create_async_engine(db_url)
                async_session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
                async with async_session_factory() as db:
                    # Store waypoints as dicts with lat/lng (not just string IDs)
                    db_waypoints = []
                    for seq, stop_id in enumerate(result.ordered_stops, start=1):
                        s = stop_lookup.get(stop_id)
                        if s and hasattr(s, 'lat'):
                            db_waypoints.append({
                                "stop_id": stop_id,
                                "lat": s.lat, "lng": s.lng,
                                "sequence": seq, "type": "stop",
                            })
                        else:
                            db_waypoints.append({"stop_id": stop_id, "sequence": seq, "type": "stop"})
                    await db.execute(
                        text("""
                            INSERT INTO route_plans (id, order_id, tenant_id, waypoints, total_distance_km,
                                total_duration_minutes, solver_status, solver_duration_ms, created_at)
                            VALUES (gen_random_uuid(), :order_id, :tenant_id, :waypoints, :total_distance_km,
                                :total_duration_minutes, :solver_status, :solver_duration_ms, NOW())
                        """),
                        {
                            "order_id": order_id,
                            "tenant_id": tenant_id,
                            "waypoints": json.dumps(db_waypoints),
                            "total_distance_km": result.total_distance_km,
                            "total_duration_minutes": result.total_duration_minutes,
                            "solver_status": result.solver_status,
                            "solver_duration_ms": result.solver_duration_ms,
                        },
                    )
                    await db.commit()
                await engine.dispose()
            except Exception as db_err:
                logger.warning("solver_db_save_skipped", job_id=job_id, error=str(db_err))

            # Update Redis status
            await self.redis_client.hset(redis_key, mapping={
                "status": JobStatus.COMPLETED.value,
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "result": json.dumps(result_dict),
            })

            # Publish route_updated event to Redis pub/sub
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
            await self.redis_client.publish(channel, json.dumps(event_payload))
            await self.redis_client.publish(
                get_shipment_updates_channel(),
                json.dumps({
                    "type": "shipment_updated",
                    "job_id": job_id,
                    "order_id": order_id,
                    "tenant_id": tenant_id,
                    "result": result_dict,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }),
            )

            logger.info("job_completed", job_id=job_id, status=result.solver_status, duration_ms=result.solver_duration_ms)
        except Exception as e:
            logger.error("job_failed", job_id=job_id, error=str(e))
            await self.redis_client.hset(redis_key, mapping={
                "status": JobStatus.FAILED.value,
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "error": str(e),
            })

    async def get_job_status(self, job_id: str) -> JobMetadata:
        """
        Get the status of an optimization job.

        Args:
            job_id: Job ID

        Returns:
            JobMetadata with current status and result (if completed)

        Raises:
            ValueError: If job not found
        """
        redis_key = f"optimization:job:{job_id}"
        data = await self.redis_client.hgetall(redis_key)

        if not data:
            raise ValueError(f"Job {job_id} not found")

        # Decode bytes to str
        data = {k.decode() if isinstance(k, bytes) else k: 
                v.decode() if isinstance(v, bytes) else v for k, v in data.items()}

        # Reconstruct metadata
        metadata = JobMetadata(
            job_id=data["job_id"],
            order_id=data["order_id"],
            tenant_id=data["tenant_id"],
            status=JobStatus(data["status"]),
            submitted_at=datetime.fromisoformat(data["submitted_at"]),
            started_at=datetime.fromisoformat(data["started_at"]) if "started_at" in data else None,
            completed_at=datetime.fromisoformat(data["completed_at"]) if "completed_at" in data else None,
        )

        # If result available, reconstruct RoutingResult
        if "result" in data and data["result"]:
            import json
            result_dict = json.loads(data["result"])
            metadata.result = RoutingResult(**result_dict)

        if "error" in data:
            metadata.error = data["error"]

        return metadata

    async def run_solver_sync(self, problem: RoutingProblem) -> RoutingResult:
        """
        Run the solver synchronously in a thread pool.

        Used by the agent when it needs a route immediately (synchronously).
        Wrapped in asyncio.to_thread() to avoid blocking the event loop.

        Args:
            problem: RoutingProblem to solve

        Returns:
            RoutingResult immediately

        Note:
            This blocks the current task for 200-2000ms but not the entire
            event loop. Use judiciously (only when time-critical routing needed).
        """
        import asyncio

        # Run solver in thread pool
        result = await asyncio.to_thread(self.solver.solve, problem)

        logger.info(
            "solver_executed",
            status=result.solver_status,
            duration_ms=result.solver_duration_ms,
            time_saved_minutes=result.time_saved_minutes,
        )

        return result

    async def update_job_status(
        self,
        job_id: str,
        status: JobStatus,
        result: Optional[RoutingResult] = None,
        error: Optional[str] = None,
    ) -> None:
        """
        Update job status in Redis.

        Used internally by Celery tasks.

        Args:
            job_id: Job ID
            status: New status
            result: RoutingResult if completed successfully
            error: Error message if failed
        """
        redis_key = f"optimization:job:{job_id}"
        update_dict = {
            "status": status.value,
        }

        if status == JobStatus.RUNNING:
            update_dict["started_at"] = datetime.now(timezone.utc).isoformat()

        if status == JobStatus.COMPLETED:
            update_dict["completed_at"] = datetime.now(timezone.utc).isoformat()
            if result:
                import json
                result_dict = {
                    "ordered_stops": result.ordered_stops,
                    "total_distance_km": result.total_distance_km,
                    "total_duration_minutes": result.total_duration_minutes,
                    "time_saved_minutes": result.time_saved_minutes,
                    "solver_status": result.solver_status,
                    "solver_duration_ms": result.solver_duration_ms,
                }
                update_dict["result"] = json.dumps(result_dict)

        if status == JobStatus.FAILED:
            update_dict["completed_at"] = datetime.now(timezone.utc).isoformat()
            if error:
                update_dict["error"] = error

        await self.redis_client.hset(redis_key, mapping=update_dict)

        logger.info(
            "job_status_updated",
            job_id=job_id,
            status=status.value,
            has_result=result is not None,
        )

    async def get_active_jobs_for_tenant(self, tenant_id: str) -> list[JobMetadata]:
        """
        Get all active (non-completed) jobs for a tenant.

        Args:
            tenant_id: Tenant ID

        Returns:
            List of JobMetadata for active jobs
        """
        # Scan Redis for job keys
        pattern = "optimization:job:*"
        jobs = []

        cursor = 0
        while True:
            cursor, keys = await self.redis_client.scan(cursor, match=pattern, count=100)

            for key in keys:
                data = await self.redis_client.hgetall(key)
                if not data:
                    continue

                # Decode bytes
                data = {k.decode() if isinstance(k, bytes) else k: 
                        v.decode() if isinstance(v, bytes) else v for k, v in data.items()}

                if data.get("tenant_id") == tenant_id:
                    status = JobStatus(data.get("status", "pending"))
                    if status in [JobStatus.PENDING, JobStatus.RUNNING]:
                        metadata = JobMetadata(
                            job_id=data["job_id"],
                            order_id=data["order_id"],
                            tenant_id=data["tenant_id"],
                            status=status,
                            submitted_at=datetime.fromisoformat(data["submitted_at"]),
                        )
                        jobs.append(metadata)

            if cursor == 0:
                break

        return jobs
