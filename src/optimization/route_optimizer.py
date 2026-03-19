from __future__ import annotations

import logging
from math import radians, sin, cos, sqrt, atan2
from typing import Any, Dict, List, Optional

import numpy as np
from prometheus_client import Counter, REGISTRY

from src.ml.features.traffic_client import LatLon

try:
    from ortools.constraint_solver import pywrapcp, routing_enums_pb2

    _ORTOOLS_AVAILABLE = True
except Exception:  # pragma: no cover - optional runtime dependency
    _ORTOOLS_AVAILABLE = False

logger = logging.getLogger(__name__)

try:
    vrp_matrix_type_total = Counter(
        "vrp_matrix_type_total",
        "VRP solves by matrix type",
        ["matrix_source", "tenant_id"],
    )
except ValueError:
    vrp_matrix_type_total = REGISTRY._names_to_collectors["vrp_matrix_type_total"]


def haversine(origin: LatLon, dest: LatLon) -> float:
    """Returns distance in km between two lat/lon points."""
    radius_km = 6371.0
    lat1, lon1 = radians(origin.lat), radians(origin.lng)
    lat2, lon2 = radians(dest.lat), radians(dest.lng)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return radius_km * 2 * atan2(sqrt(a), sqrt(1 - a))


class RouteOptimizer:
    """OR-Tools VRP wrapper that can optimize on ML-predicted travel times."""

    async def solve(
        self,
        orders: List[Any],
        drivers: List[Any],
        travel_time_matrix: Optional[np.ndarray] = None,
        tenant_id: str = "default",
        time_limit_sec: int = 10,
    ) -> Dict[str, Any]:
        if not orders:
            return {"routes": [], "matrix_source": "static_fallback", "unassigned": []}

        if not drivers:
            raise ValueError("At least one driver is required for route optimization")

        all_points: List[LatLon] = []
        for driver in drivers:
            if isinstance(driver, dict):
                lat = driver.get("current_lat")
                lng = driver.get("current_lng")
            else:
                lat = getattr(driver, "current_lat", None)
                lng = getattr(driver, "current_lng", None)
            if lat is None or lng is None:
                raise ValueError("Driver location missing current_lat/current_lng")
            all_points.append(LatLon(float(lat), float(lng)))

        for order in orders:
            if isinstance(order, dict):
                lat = order.get("delivery_lat", order.get("lat"))
                lng = order.get("delivery_lng", order.get("lng", order.get("lon")))
            else:
                lat = getattr(order, "delivery_lat", getattr(order, "lat", None))
                lng = getattr(order, "delivery_lng", getattr(order, "lng", getattr(order, "lon", None)))
            if lat is None or lng is None:
                raise ValueError("Order location missing delivery_lat/delivery_lng or lat/lng")
            all_points.append(LatLon(float(lat), float(lng)))

        order_ids: List[str] = []
        for order in orders:
            if isinstance(order, dict):
                order_ids.append(str(order.get("id", order.get("order_id", ""))))
            else:
                order_ids.append(str(getattr(order, "id", "")))

        matrix_source = "ml_predicted" if travel_time_matrix is not None else "static_fallback"

        if not _ORTOOLS_AVAILABLE:
            # Deterministic fallback for environments without OR-Tools.
            fallback_route = [oid for oid in order_ids if oid]
            first_driver = drivers[0]
            if isinstance(first_driver, dict):
                fallback_driver_id = str(first_driver.get("id", "driver_0"))
            else:
                fallback_driver_id = str(getattr(first_driver, "id", "driver_0"))
            vrp_matrix_type_total.labels(matrix_source=matrix_source, tenant_id=str(tenant_id)).inc()
            return {
                "routes": [{"driver_id": fallback_driver_id, "route": fallback_route}],
                "matrix_source": matrix_source,
                "unassigned": [],
            }

        n_nodes = len(all_points)
        num_vehicles = len(drivers)
        starts = list(range(num_vehicles))
        ends = list(range(num_vehicles))

        manager = pywrapcp.RoutingIndexManager(n_nodes, num_vehicles, starts, ends)
        routing = pywrapcp.RoutingModel(manager)

        if travel_time_matrix is not None:
            # ML-informed routing - use predicted travel times.
            def transit_callback(from_index, to_index):
                from_node = manager.IndexToNode(from_index)
                to_node = manager.IndexToNode(to_index)
                return int(travel_time_matrix[from_node][to_node])

            matrix_source = "ml_predicted"
        else:
            # Fallback - static haversine distances converted to seconds at 30 km/h.
            def transit_callback(from_index, to_index):
                from_node = manager.IndexToNode(from_index)
                to_node = manager.IndexToNode(to_index)
                dist_km = haversine(all_points[from_node], all_points[to_node])
                return int((dist_km / 30.0) * 3600)

            matrix_source = "static_fallback"

        transit_callback_index = routing.RegisterTransitCallback(transit_callback)
        routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

        # Allow dropping only order nodes (not driver/depot nodes).
        for node in range(num_vehicles, n_nodes):
            routing.AddDisjunction([manager.NodeToIndex(node)], 100000)

        search_parameters = pywrapcp.DefaultRoutingSearchParameters()
        search_parameters.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
        search_parameters.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
        search_parameters.time_limit.seconds = max(int(time_limit_sec), 1)

        solution = routing.SolveWithParameters(search_parameters)

        routes: List[Dict[str, Any]] = []
        unassigned: List[str] = []

        if solution:
            for vehicle_id in range(num_vehicles):
                index = routing.Start(vehicle_id)
                route_order_ids: List[str] = []

                while not routing.IsEnd(index):
                    node = manager.IndexToNode(index)
                    if node >= num_vehicles:
                        order_idx = node - num_vehicles
                        if 0 <= order_idx < len(order_ids) and order_ids[order_idx]:
                            route_order_ids.append(order_ids[order_idx])
                    index = solution.Value(routing.NextVar(index))

                driver_obj = drivers[vehicle_id] if vehicle_id < len(drivers) else {}
                if isinstance(driver_obj, dict):
                    driver_id = str(driver_obj.get("id", f"driver_{vehicle_id}"))
                else:
                    driver_id = str(getattr(driver_obj, "id", f"driver_{vehicle_id}"))

                routes.append({"driver_id": driver_id, "route": route_order_ids})

            for node in range(num_vehicles, n_nodes):
                index = manager.NodeToIndex(node)
                if solution.Value(routing.NextVar(index)) == index:
                    order_idx = node - num_vehicles
                    if 0 <= order_idx < len(order_ids) and order_ids[order_idx]:
                        unassigned.append(order_ids[order_idx])
        else:
            logger.warning("OR-Tools returned no solution, returning empty assignment")
            routes = []
            unassigned = [oid for oid in order_ids if oid]

        result = {
            "routes": routes,
            "unassigned": unassigned,
            "matrix_source": matrix_source,
        }

        vrp_matrix_type_total.labels(matrix_source=matrix_source, tenant_id=str(tenant_id)).inc()
        return result
