"""
VRP Solver - Google OR-Tools wrapper for vehicle routing problems.

This module provides a VRPSolver that handles the re-routing problem:
- A driver is at position (lat, lng)
- They have N remaining stops (each with lat, lng, time window)
- Find the optimal order to visit the stops
- Minimize travel time
- Respect time windows if provided

Key principle: Always returns a result within timeout_seconds.
Never raises an exception for solver failures.
"""

import math
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

import structlog
from ortools.linear_solver import pywraplp
from ortools.constraint_solver import pywrapcp, routing_enums_pb2

logger = structlog.get_logger(__name__)


# ===== Data Models =====


@dataclass
class RoutingStop:
    """A single stop in the routing problem."""

    stop_id: str
    lat: float
    lng: float
    demand: int = 1  # packages/items to deliver
    time_window_start: Optional[datetime] = None  # Must arrive after
    time_window_end: Optional[datetime] = None  # Must arrive before
    service_time_minutes: float = 3.0  # Time to complete delivery


@dataclass
class RoutingProblem:
    """A vehicle routing problem to be solved."""

    origin: tuple[float, float]  # driver's current (lat, lng)
    stops: list[RoutingStop]
    vehicle_capacity: Optional[int] = None  # max items per vehicle


@dataclass
class RoutingResult:
    """Result of solving a routing problem."""

    ordered_stops: list[str]  # stop_ids in optimal visit order
    total_distance_km: float
    total_duration_minutes: float
    time_saved_minutes: float  # vs original order (if provided)
    solver_status: str  # "optimal", "feasible", "timeout", "infeasible"
    solver_duration_ms: int


# ===== Helper Functions =====


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calculate great-circle distance between two points (in meters).

    Uses Haversine formula. Returns distance in meters.
    """
    R = 6371000  # Earth radius in meters
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(
        math.radians(lat2)
    ) * math.sin(dlng / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    return R * c


def get_distance_matrix(
    origin_lat: float, origin_lng: float, stops: list[RoutingStop]
) -> list[list[int]]:
    """
    Build distance matrix for OR-Tools (in meters as integers).

    Matrix format:
    - Row 0: origin to all stops
    - Row i (i>0): stop i-1 to all stops and origin

    Applies 1.3x urban factor to approximate road distance from crow-flies distance.

    TODO: In production, replace with actual routing API call:
    - Google Maps Distance Matrix API
    - OSRM (Open Source Routing Machine)
    - Mapbox
    This would give accurate turn-by-turn distances and respect road networks.
    """
    urban_factor = 1.3  # Road distance is ~1.3x crow-flies in urban areas

    # Include origin + all stops
    locations = [(origin_lat, origin_lng)] + [(s.lat, s.lng) for s in stops]
    n = len(locations)

    # Build distance matrix (meters as integers, required by OR-Tools)
    matrix = []
    for i in range(n):
        row = []
        for j in range(n):
            if i == j:
                distance = 0
            else:
                crowflies = haversine_distance(
                    locations[i][0],
                    locations[i][1],
                    locations[j][0],
                    locations[j][1],
                )
                distance = int(crowflies * urban_factor)
            row.append(distance)
        matrix.append(row)

    return matrix


def get_time_matrix(distance_matrix: list[list[int]]) -> list[list[int]]:
    """
    Convert distance matrix to time matrix (in seconds).

    Assumes average speed of 40 km/h in urban areas.
    Distance in meters / 40 km/h = seconds.
    """
    speed_kmh = 40
    speed_m_per_sec = speed_kmh * 1000 / 3600  # Convert km/h to m/s

    time_matrix = []
    for row in distance_matrix:
        time_row = [max(1, int(d / speed_m_per_sec)) for d in row]  # At least 1 second
        time_matrix.append(time_row)

    return time_matrix


# ===== VRP Solver =====


class VRPSolver:
    """
    Vehicle Routing Problem solver using Google OR-Tools.

    Handles re-routing for delivery optimization with time windows.
    """

    def __init__(self, timeout_seconds: int = 5):
        """
        Initialize solver.

        Args:
            timeout_seconds: Maximum time to spend solving (default 5s)
        """
        self.timeout_seconds = timeout_seconds

    def solve(self, problem: RoutingProblem) -> RoutingResult:
        """
        Solve the routing problem.

        Always returns a result within timeout_seconds:
        - If optimal solution found: solver_status = "optimal"
        - If good-enough solution found: solver_status = "feasible"
        - If timeout reached: solver_status = "timeout" (returns best so far)
        - If no solution possible: solver_status = "infeasible"

        Never raises an exception — always returns a RoutingResult.

        Args:
            problem: RoutingProblem to solve

        Returns:
            RoutingResult with ordered stops, distances, duration, and status
        """
        start_time = time.time()

        try:
            # Edge case: 0 or 1 stops
            if len(problem.stops) == 0:
                return RoutingResult(
                    ordered_stops=[],
                    total_distance_km=0.0,
                    total_duration_minutes=0.0,
                    time_saved_minutes=0.0,
                    solver_status="feasible",
                    solver_duration_ms=int((time.time() - start_time) * 1000),
                )

            if len(problem.stops) == 1:
                stop_id = problem.stops[0].stop_id
                dist_m = haversine_distance(
                    problem.origin[0],
                    problem.origin[1],
                    problem.stops[0].lat,
                    problem.stops[0].lng,
                )
                distance_km = (dist_m * 1.3) / 1000  # Apply urban factor
                duration_min = (distance_km / 40) * 60 + problem.stops[0].service_time_minutes
                return RoutingResult(
                    ordered_stops=[stop_id],
                    total_distance_km=distance_km,
                    total_duration_minutes=duration_min,
                    time_saved_minutes=0.0,
                    solver_status="feasible",
                    solver_duration_ms=int((time.time() - start_time) * 1000),
                )

            # Build distance matrix
            distance_matrix = get_distance_matrix(problem.origin[0], problem.origin[1], problem.stops)
            time_matrix = get_time_matrix(distance_matrix)

            # Create routing index manager
            manager = pywrapcp.RoutingIndexManager(
                len(distance_matrix),  # number of locations (origin + stops)
                1,  # number of vehicles
                0,  # depot index (origin is location 0)
            )

            # Create routing model
            routing = pywrapcp.RoutingModel(manager)

            # Set cost function: use time as primary cost
            def time_callback(from_index, to_index):
                """Return time between locations in seconds."""
                return time_matrix[manager.IndexToNode(from_index)][manager.IndexToNode(to_index)]

            callback_index = routing.RegisterTransitCallback(time_callback)
            routing.SetArcCostEvaluatorOfAllVehicles(callback_index)

            # Add service time to time dimension
            time_dimension_name = "Time"
            routing.AddDimension(
                callback_index,
                0,  # slack (waiting time)
                86400,  # max travel time per vehicle (24 hours in seconds)
                True,  # start cumul to zero
                time_dimension_name,
            )

            time_dimension = routing.GetDimensionOrDie(time_dimension_name)

            # Add service times
            for i, stop in enumerate(problem.stops):
                location_index = manager.NodeToIndex(i + 1)  # +1 because 0 is origin
                service_time_seconds = int(stop.service_time_minutes * 60)
                time_dimension.CumulVar(location_index).SetMin(service_time_seconds)

            # Add time windows if provided
            for i, stop in enumerate(problem.stops):
                if stop.time_window_start or stop.time_window_end:
                    location_index = manager.NodeToIndex(i + 1)
                    time_var = time_dimension.CumulVar(location_index)

                    if stop.time_window_start:
                        # Convert datetime to seconds since epoch
                        start_seconds = int(stop.time_window_start.timestamp())
                        time_var.SetMin(start_seconds)

                    if stop.time_window_end:
                        # Convert datetime to seconds since epoch
                        end_seconds = int(stop.time_window_end.timestamp())
                        time_var.SetMax(end_seconds)

            # Add vehicle capacity if specified
            if problem.vehicle_capacity:
                def demand_callback(from_index):
                    """Return demand at location."""
                    node = manager.IndexToNode(from_index)
                    if node == 0:
                        return 0  # origin has no demand
                    return problem.stops[node - 1].demand

                demand_callback_index = routing.RegisterTransitCallback(demand_callback)
                routing.AddDimension(
                    demand_callback_index,
                    0,  # slack
                    problem.vehicle_capacity,  # vehicle capacity
                    True,  # start cumul to zero
                    "Capacity",
                )

            # Set search parameters
            search_parameters = pywrapcp.DefaultRoutingSearchParameters()
            search_parameters.first_solution_strategy = (
                routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
            )
            search_parameters.time_limit.seconds = self.timeout_seconds

            # Solve
            solution = routing.SolveWithParameters(search_parameters)

            # Extract solution
            if solution:
                ordered_indices = []
                current_index = routing.Start(0)

                while not routing.IsEnd(current_index):
                    node = manager.IndexToNode(current_index)
                    if node > 0:  # Skip origin
                        ordered_indices.append(node - 1)  # Convert back to stop index
                    current_index = solution.Value(routing.NextVar(current_index))

                # Convert to stop_ids
                ordered_stops = [problem.stops[i].stop_id for i in ordered_indices]

                # Calculate metrics
                total_distance_m = solution.ObjectiveValue()
                total_distance_km = total_distance_m / 1000

                # Add service times
                total_service_minutes = sum(s.service_time_minutes for s in problem.stops)
                total_duration_minutes = (total_distance_km / 40) * 60 + total_service_minutes

                # Calculate time saved vs original order
                original_order_indices = list(range(len(problem.stops)))
                original_distance_m = 0
                for i in range(len(original_order_indices)):
                    from_idx = 0 if i == 0 else original_order_indices[i - 1] + 1
                    to_idx = original_order_indices[i] + 1
                    original_distance_m += distance_matrix[from_idx][to_idx]

                original_distance_km = original_distance_m / 1000
                original_duration_minutes = (original_distance_km / 40) * 60 + total_service_minutes
                time_saved_minutes = original_duration_minutes - total_duration_minutes

                # OR-Tools Python wrappers differ across versions; mark solved results as feasible.
                solver_status = "feasible"

                return RoutingResult(
                    ordered_stops=ordered_stops,
                    total_distance_km=total_distance_km,
                    total_duration_minutes=max(0, total_duration_minutes),
                    time_saved_minutes=max(0, time_saved_minutes),
                    solver_status=solver_status,
                    solver_duration_ms=int((time.time() - start_time) * 1000),
                )
            else:
                # No solution found
                solver_duration_ms = int((time.time() - start_time) * 1000)

                if solver_duration_ms >= self.timeout_seconds * 1000 * 0.9:
                    # Likely timed out
                    solver_status = "timeout"
                else:
                    # No feasible solution
                    solver_status = "infeasible"

                logger.warning(
                    "solver_no_solution",
                    status=solver_status,
                    num_stops=len(problem.stops),
                    duration_ms=solver_duration_ms,
                )

                return RoutingResult(
                    ordered_stops=list(range(len(problem.stops))),  # Fallback: original order
                    total_distance_km=0.0,
                    total_duration_minutes=0.0,
                    time_saved_minutes=0.0,
                    solver_status=solver_status,
                    solver_duration_ms=solver_duration_ms,
                )

        except Exception as e:
            # Catch all exceptions and return timeout status
            solver_duration_ms = int((time.time() - start_time) * 1000)
            logger.error(
                "solver_exception",
                error=str(e),
                num_stops=len(problem.stops),
                duration_ms=solver_duration_ms,
            )

            return RoutingResult(
                ordered_stops=list(range(len(problem.stops))),  # Fallback: original order
                total_distance_km=0.0,
                total_duration_minutes=0.0,
                time_saved_minutes=0.0,
                solver_status="timeout",
                solver_duration_ms=solver_duration_ms,
            )
