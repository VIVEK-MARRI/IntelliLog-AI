from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from src.optimization.service import JobStatus, OptimizationService
from src.optimization.solver import RoutingProblem, RoutingStop, haversine_distance, get_time_matrix


def test_haversine_and_time_matrix_helpers() -> None:
    distance_meters = haversine_distance(40.7128, -74.0060, 40.7328, -73.9860)
    assert distance_meters > 0

    matrix = get_time_matrix([[0, 1000], [1000, 0]])
    assert matrix[0][1] > 0


@pytest.mark.asyncio
async def test_optimization_job_lifecycle(test_redis) -> None:
    service = OptimizationService(test_redis)
    problem = RoutingProblem(
        origin=(40.7128, -74.0060),
        stops=[
            RoutingStop(stop_id="stop-1", lat=40.7228, lng=-74.0020),
            RoutingStop(stop_id="stop-2", lat=40.7328, lng=-73.9960),
        ],
    )

    job_id = await service.submit_job("order-1", "tenant-1", problem)
    metadata = await service.get_job_status(job_id)

    assert metadata.job_id == job_id
    assert metadata.status == JobStatus.PENDING

    await service.update_job_status(job_id, JobStatus.RUNNING)
    await service.update_job_status(job_id, JobStatus.COMPLETED)

    updated = await service.get_job_status(job_id)
    assert updated.status == JobStatus.COMPLETED

    active_jobs = await service.get_active_jobs_for_tenant("tenant-1")
    assert active_jobs == []
