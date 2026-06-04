"""
Optimization module - Route optimization and VRP solving.

This module handles asynchronous route optimization using Google OR-Tools.
Key principle: optimization jobs are queued (Celery) and never block the API thread.

Components:
- solver.py: VRPSolver (Google OR-Tools wrapper)
- service.py: OptimizationService (async job management)
- tasks.py: Celery tasks (background job execution)
"""

from src.optimization.solver import VRPSolver, RoutingProblem, RoutingStop, RoutingResult
from src.optimization.service import OptimizationService, JobStatus

__all__ = [
    "VRPSolver",
    "RoutingProblem",
    "RoutingStop",
    "RoutingResult",
    "OptimizationService",
    "JobStatus",
]
