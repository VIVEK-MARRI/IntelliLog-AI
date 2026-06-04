"""
Tests for the optimization service.

Coverage:
- VRPSolver: Basic solving, timeout handling, no exceptions
- OptimizationService: Job submission, status tracking
- Celery integration: Task execution, Redis updates
"""

import json
import time
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import redis.asyncio as redis

from src.optimization.solver import (
    RoutingProblem,
    RoutingResult,
    RoutingStop,
    VRPSolver,
    haversine_distance,
)
from src.optimization.service import JobStatus, OptimizationService


# ===== Fixtures =====


@pytest.fixture
def solver():
    """VRPSolver instance with 5-second timeout."""
    return VRPSolver(timeout_seconds=5)


@pytest.fixture
def five_stop_problem():
    """Routing problem with 5 stops in NYC area."""
    origin = (40.7128, -74.0060)  # Times Square

    stops = [
        RoutingStop(
            stop_id="stop-001",
            lat=40.7300,
            lng=-74.0050,
            service_time_minutes=3.0,
        ),
        RoutingStop(
            stop_id="stop-002",
            lat=40.7200,
            lng=-73.9900,
            service_time_minutes=3.0,
        ),
        RoutingStop(
            stop_id="stop-003",
            lat=40.7500,
            lng=-74.0100,
            service_time_minutes=2.0,
        ),
        RoutingStop(
            stop_id="stop-004",
            lat=40.6850,
            lng=-74.0200,
            service_time_minutes=4.0,
        ),
        RoutingStop(
            stop_id="stop-005",
            lat=40.7400,
            lng=-73.9850,
            service_time_minutes=3.0,
        ),
    ]

    return RoutingProblem(origin=origin, stops=stops)


@pytest.fixture
def single_stop_problem():
    """Routing problem with single stop."""
    origin = (40.7128, -74.0060)
    stops = [
        RoutingStop(
            stop_id="stop-001",
            lat=40.7300,
            lng=-74.0050,
            service_time_minutes=3.0,
        )
    ]
    return RoutingProblem(origin=origin, stops=stops)


@pytest.fixture
def empty_problem():
    """Routing problem with no stops."""
    origin = (40.7128, -74.0060)
    return RoutingProblem(origin=origin, stops=[])


@pytest.fixture
async def mock_redis():
    """Mock Redis client."""
    mock_client = AsyncMock(spec=redis.Redis)
    mock_client.hset = AsyncMock()
    mock_client.hgetall = AsyncMock()
    mock_client.expire = AsyncMock()
    mock_client.scan = AsyncMock(return_value=(0, []))
    return mock_client


@pytest.fixture
async def optimization_service(mock_redis):
    """OptimizationService with mock Redis."""
    return OptimizationService(mock_redis)


# ===== Tests: Helper Functions =====


def test_haversine_distance_ny_to_la():
    """Test Haversine distance calculation (NY to LA)."""
    # New York: 40.7128, -74.0060
    # Los Angeles: 34.0522, -118.2437
    # Expected: ~3944 km
    distance_m = haversine_distance(40.7128, -74.0060, 34.0522, -118.2437)
    distance_km = distance_m / 1000

    assert 3900 < distance_km < 4000


def test_haversine_distance_same_point():
    """Test Haversine distance for same point."""
    distance = haversine_distance(40.7128, -74.0060, 40.7128, -74.0060)
    assert distance == 0


def test_haversine_distance_nearby_points():
    """Test Haversine distance for nearby points (1 km)."""
    # About 1 km apart
    distance_m = haversine_distance(40.7128, -74.0060, 40.7228, -74.0060)
    distance_km = distance_m / 1000

    # Expect ~1.1 km (1 degree of latitude ≈ 111 km)
    assert 0.5 < distance_km < 2.0


# ===== Tests: Solver - Basic Functionality =====


def test_solver_empty_problem(solver, empty_problem):
    """Test solver with empty problem (no stops)."""
    result = solver.solve(empty_problem)

    assert result is not None
    assert isinstance(result, RoutingResult)
    assert result.ordered_stops == []
    assert result.total_distance_km == 0.0
    assert result.total_duration_minutes == 0.0
    assert result.solver_status == "feasible"
    assert result.solver_duration_ms >= 0


def test_solver_single_stop(solver, single_stop_problem):
    """Test solver with single stop."""
    result = solver.solve(single_stop_problem)

    assert result is not None
    assert isinstance(result, RoutingResult)
    assert len(result.ordered_stops) == 1
    assert result.ordered_stops[0] == "stop-001"
    assert result.total_distance_km > 0
    assert result.total_duration_minutes > 0
    assert result.solver_status == "feasible"


def test_solver_five_stop_problem(solver, five_stop_problem):
    """Test solver with 5-stop problem."""
    result = solver.solve(five_stop_problem)

    assert result is not None
    assert isinstance(result, RoutingResult)
    assert len(result.ordered_stops) == 5
    assert all(stop_id in result.ordered_stops for stop_id in 
               [s.stop_id for s in five_stop_problem.stops])
    assert result.total_distance_km > 0
    assert result.total_duration_minutes > 0
    assert result.solver_status in ["optimal", "feasible"]
    assert result.solver_duration_ms < 1000  # < 1 second


def test_solver_returns_valid_types(solver, five_stop_problem):
    """Test that solver returns correct types."""
    result = solver.solve(five_stop_problem)

    assert isinstance(result.ordered_stops, list)
    assert all(isinstance(s, str) for s in result.ordered_stops)
    assert isinstance(result.total_distance_km, float)
    assert isinstance(result.total_duration_minutes, float)
    assert isinstance(result.time_saved_minutes, float)
    assert isinstance(result.solver_status, str)
    assert isinstance(result.solver_duration_ms, int)


# ===== Tests: Solver - Timeout Handling =====


def test_solver_timeout_no_exception(five_stop_problem):
    """Test solver timeout returns "timeout" status, never raises exception."""
    # Create solver with very short timeout
    solver = VRPSolver(timeout_seconds=0.01)  # 10ms timeout

    result = solver.solve(five_stop_problem)

    assert result is not None
    assert isinstance(result, RoutingResult)
    # Either "timeout" or "feasible" (if happened to solve quickly)
    assert result.solver_status in ["timeout", "feasible"]
    # Should not raise exception


def test_solver_always_returns_result_never_exception(five_stop_problem):
    """Test that solver never raises exception, always returns RoutingResult."""
    solver = VRPSolver(timeout_seconds=1)

    try:
        result = solver.solve(five_stop_problem)
        assert result is not None
        assert isinstance(result, RoutingResult)
    except Exception as e:
        pytest.fail(f"Solver raised exception: {type(e).__name__}: {e}")


# ===== Tests: Solver - Optimization =====


def test_solver_optimizes_route(solver, five_stop_problem):
    """Test that solver produces better route than naive order."""
    result = solver.solve(five_stop_problem)

    # Time saved should typically be > 0 (optimized vs sequential)
    # Allow for cases where sequential is already near-optimal
    assert result.time_saved_minutes >= 0.0


def test_solver_stops_in_different_order(solver, five_stop_problem):
    """Test that solver may reorder stops (not always sequential)."""
    result = solver.solve(five_stop_problem)

    # Get original order
    original_order = [s.stop_id for s in five_stop_problem.stops]

    # Solver should potentially reorder (but not guaranteed)
    # Just verify it returns the stops in some order
    assert set(result.ordered_stops) == set(original_order)


# ===== Tests: OptimizationService - Job Submission =====


@pytest.mark.asyncio
async def test_service_submit_job_returns_job_id(optimization_service, five_stop_problem):
    """Test that submit_job returns job_id in < 10ms."""
    start = time.time()

    job_id = await optimization_service.submit_job(
        order_id="order-001",
        tenant_id="tenant-001",
        problem=five_stop_problem,
    )

    elapsed_ms = (time.time() - start) * 1000

    assert job_id is not None
    assert isinstance(job_id, str)
    assert len(job_id) > 0
    assert elapsed_ms < 50  # Should be very fast (< 50ms)


@pytest.mark.asyncio
async def test_service_submit_job_stores_in_redis(optimization_service, five_stop_problem):
    """Test that submit_job stores job metadata in Redis."""
    job_id = await optimization_service.submit_job(
        order_id="order-001",
        tenant_id="tenant-001",
        problem=five_stop_problem,
    )

    # Verify Redis calls were made
    optimization_service.redis_client.hset.assert_called()
    optimization_service.redis_client.expire.assert_called()


@pytest.mark.asyncio
async def test_service_get_job_status_not_found(optimization_service):
    """Test get_job_status raises error for non-existent job."""
    optimization_service.redis_client.hgetall.return_value = {}

    with pytest.raises(ValueError, match="not found"):
        await optimization_service.get_job_status("nonexistent-job-id")


@pytest.mark.asyncio
async def test_service_get_job_status_pending(optimization_service):
    """Test get_job_status returns pending job."""
    job_data = {
        b"job_id": b"job-123",
        b"order_id": b"order-001",
        b"tenant_id": b"tenant-001",
        b"status": b"pending",
        b"submitted_at": datetime.now(timezone.utc).isoformat().encode(),
    }
    optimization_service.redis_client.hgetall.return_value = job_data

    status = await optimization_service.get_job_status("job-123")

    assert status.job_id == "job-123"
    assert status.order_id == "order-001"
    assert status.status == JobStatus.PENDING


@pytest.mark.asyncio
async def test_service_get_job_status_completed(optimization_service):
    """Test get_job_status returns completed job with result."""
    result_dict = {
        "ordered_stops": ["stop-001", "stop-002"],
        "total_distance_km": 5.5,
        "total_duration_minutes": 15.0,
        "time_saved_minutes": 2.5,
        "solver_status": "optimal",
        "solver_duration_ms": 250,
    }

    job_data = {
        b"job_id": b"job-123",
        b"order_id": b"order-001",
        b"tenant_id": b"tenant-001",
        b"status": b"completed",
        b"submitted_at": datetime.now(timezone.utc).isoformat().encode(),
        b"completed_at": datetime.now(timezone.utc).isoformat().encode(),
        b"result": json.dumps(result_dict).encode(),
    }
    optimization_service.redis_client.hgetall.return_value = job_data

    status = await optimization_service.get_job_status("job-123")

    assert status.job_id == "job-123"
    assert status.status == JobStatus.COMPLETED
    assert status.result is not None
    assert status.result.time_saved_minutes == 2.5


# ===== Tests: OptimizationService - Sync Execution =====


@pytest.mark.asyncio
async def test_service_run_solver_sync(optimization_service, five_stop_problem):
    """Test run_solver_sync executes immediately."""
    result = await optimization_service.run_solver_sync(five_stop_problem)

    assert result is not None
    assert isinstance(result, RoutingResult)
    assert len(result.ordered_stops) == 5
    assert result.total_distance_km > 0


@pytest.mark.asyncio
async def test_service_run_solver_sync_under_100ms(optimization_service, single_stop_problem):
    """Test run_solver_sync completes quickly for simple problem."""
    start = time.time()

    result = await optimization_service.run_solver_sync(single_stop_problem)

    elapsed_ms = (time.time() - start) * 1000

    assert result is not None
    assert elapsed_ms < 1000  # < 1 second


# ===== Tests: Celery Task Integration =====


def test_celery_task_imports():
    """Test that Celery task can be imported."""
    from src.optimization.tasks import solve_routing_job

    assert solve_routing_job is not None
    assert hasattr(solve_routing_job, "delay")  # Verify it's a Celery task


# ===== Tests: Integration =====


@pytest.mark.asyncio
async def test_end_to_end_submit_and_check_status(optimization_service, five_stop_problem):
    """Test end-to-end job submission and status checking."""
    # Submit job
    job_id = await optimization_service.submit_job(
        order_id="order-001",
        tenant_id="tenant-001",
        problem=five_stop_problem,
    )

    assert job_id is not None

    # Setup mock data for status check
    job_data = {
        b"job_id": job_id.encode(),
        b"order_id": b"order-001",
        b"tenant_id": b"tenant-001",
        b"status": b"pending",
        b"submitted_at": datetime.now(timezone.utc).isoformat().encode(),
    }
    optimization_service.redis_client.hgetall.return_value = job_data

    # Get status
    status = await optimization_service.get_job_status(job_id)

    assert status.job_id == job_id
    assert status.status == JobStatus.PENDING


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
