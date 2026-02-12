"""
src/optimization/vrp_solver.py

Advanced Route Optimization utilities for IntelliLog-AI.

Features:
---------
✅ Accurate haversine-based geodesic distances
✅ NetworkX graph-based pathfinding (Dijkstra / A*)
✅ OR-Tools VRP with capacity + time window constraints
✅ ML-aware greedy assignment (priority by predicted delay + distance)
✅ Unified planner interface (plan_routes) for FastAPI use
✅ Dynamic traffic/time-weighted penalty support
✅ Graceful fallback to greedy when OR-Tools is unavailable or fails

Author: Vivek Marri
Project: IntelliLog-AI
Version: 2.2.0
"""

from __future__ import annotations
from typing import List, Tuple, Dict, Any, Optional
import math
import logging
import numpy as np
import pandas as pd
from datetime import datetime

# -------------------------------
# Optional Imports
# -------------------------------
try:
    import networkx as nx
except ImportError:
    raise ImportError("networkx is required. Run: pip install networkx")

try:
    from ortools.constraint_solver import pywrapcp, routing_enums_pb2
    _ORTOOLS_AVAILABLE = True
except ImportError:
    _ORTOOLS_AVAILABLE = False

logger = logging.getLogger(__name__)
logger.addHandler(logging.NullHandler())

# ===========================================================
# Distance & Graph Utilities
# ===========================================================
def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine distance between two lat/lon points in kilometers."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) *
         math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def build_distance_matrix(points: List[Tuple[float, float]]) -> np.ndarray:
    """Build symmetric distance matrix (km) for all points."""
    n = len(points)
    mat = np.zeros((n, n), dtype=float)
    for i in range(n):
        for j in range(i + 1, n):
            d = haversine(points[i][0], points[i][1], points[j][0], points[j][1])
            mat[i, j] = mat[j, i] = d
    return mat


def build_graph(points: List[Tuple[float, float]], distance_matrix: Optional[np.ndarray] = None) -> "nx.Graph":
    """Build undirected graph with edge weight = distance (km)."""
    if distance_matrix is None:
        distance_matrix = build_distance_matrix(points)
    G = nx.Graph()
    for i, (lat, lon) in enumerate(points):
        G.add_node(i, lat=lat, lon=lon)
    for i in range(len(points)):
        for j in range(i + 1, len(points)):
            G.add_edge(i, j, weight=float(distance_matrix[i, j]))
    return G

# ===========================================================
# Shortest Path Utilities
# ===========================================================
def shortest_path_dijkstra(graph: "nx.Graph", source: int, target: int) -> Tuple[List[int], float]:
    """Shortest path and distance using Dijkstra."""
    path = nx.dijkstra_path(graph, source, target, weight="weight")
    length = nx.dijkstra_path_length(graph, source, target, weight="weight")
    return path, float(length)


def shortest_path_astar(graph: "nx.Graph", source: int, target: int, points: List[Tuple[float, float]]) -> Tuple[List[int], float]:
    """Shortest path using A* with haversine heuristic."""
    def heuristic(u, v):
        return haversine(points[u][0], points[u][1], points[v][0], points[v][1])
    path = nx.astar_path(graph, source, target, heuristic=heuristic, weight="weight")
    length = nx.path_weight(graph, path, weight="weight")
    return path, float(length)

# ===========================================================
# OR-Tools VRP with Capacities + Time Windows
# ===========================================================
def build_time_matrix(distance_matrix_km: np.ndarray, avg_speed_kmph: float) -> np.ndarray:
    """Build time matrix in seconds from distance matrix (km)."""
    speed = max(avg_speed_kmph, 5.0)
    return (distance_matrix_km / speed * 3600).astype(int)


def ortools_vrp(
    distance_matrix_km: np.ndarray,
    num_vehicles: int = 3,
    starts: Optional[List[int]] = None,
    ends: Optional[List[int]] = None,
    capacities: Optional[List[int]] = None,
    demands: Optional[List[int]] = None,
    time_windows: Optional[List[Tuple[int, int]]] = None,
    service_times_min: Optional[List[int]] = None,
    avg_speed_kmph: float = 30.0,
    time_matrix_sec: Optional[np.ndarray] = None,
    time_limit_sec: int = 10,
    allow_dropping: bool = True,
    drop_penalty: int = 100000,
) -> Dict[str, Any]:
    """
    Solve Vehicle Routing Problem using OR-Tools with constraints.

    Returns:
        dict with routes, distances, durations, and unassigned nodes.
    """
    if not _ORTOOLS_AVAILABLE:
        raise RuntimeError("OR-Tools not available. Install ortools to use this solver.")

    if distance_matrix_km.size == 0:
        return {"routes": [], "route_dist_km": [], "route_dur_min": [], "unassigned": []}

    n_nodes = distance_matrix_km.shape[0]
    dm = (distance_matrix_km * 1000).astype(int).tolist()  # meters for precision
    if time_matrix_sec is None:
        time_matrix_sec = build_time_matrix(distance_matrix_km, avg_speed_kmph)
    if isinstance(time_matrix_sec, np.ndarray):
        time_matrix_sec = time_matrix_sec.astype(int)
    else:
        time_matrix_sec = np.array(time_matrix_sec, dtype=int)
    time_matrix_sec = time_matrix_sec.tolist()
    service_times = service_times_min or [0] * n_nodes
    if len(service_times) != n_nodes:
        raise ValueError("Service times length must match number of nodes")
    service_times_sec = [int(s * 60) for s in service_times]

    if starts is None:
        starts = [0] * num_vehicles
    if ends is None:
        ends = [0] * num_vehicles

    if len(starts) != num_vehicles or len(ends) != num_vehicles:
        raise ValueError("Starts/ends must match num_vehicles")

    manager = pywrapcp.RoutingIndexManager(n_nodes, num_vehicles, starts, ends)
    routing = pywrapcp.RoutingModel(manager)

    # Distance callback
    def distance_callback(from_index, to_index):
        from_node, to_node = manager.IndexToNode(from_index), manager.IndexToNode(to_index)
        return dm[from_node][to_node]

    transit_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_index)

    # Capacity dimension
    if capacities and demands:
        if len(demands) != n_nodes:
            raise ValueError("Demands length must match number of nodes")
        if len(capacities) != num_vehicles:
            raise ValueError("Capacities length must match num_vehicles")

        def demand_callback(from_index):
            return int(demands[manager.IndexToNode(from_index)])

        demand_callback_index = routing.RegisterUnaryTransitCallback(demand_callback)
        routing.AddDimensionWithVehicleCapacity(
            demand_callback_index, 0, capacities, True, "Capacity"
        )

    # Time windows
    if time_windows:
        if len(time_windows) != n_nodes:
            raise ValueError("Time windows length must match number of nodes")

        def time_callback(from_index, to_index):
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            return int(time_matrix_sec[from_node][to_node] + service_times_sec[from_node])

        time_callback_index = routing.RegisterTransitCallback(time_callback)
        max_time_sec = max([end * 60 for _, end in time_windows] + [24 * 60 * 60])

        routing.AddDimension(
            time_callback_index,
            300,     # waiting slack (5 minutes)
            max_time_sec,
            False,
            "Time"
        )

        time_dim = routing.GetDimensionOrDie("Time")
        for node_idx, (start, end) in enumerate(time_windows):
            index = manager.NodeToIndex(node_idx)
            time_dim.CumulVar(index).SetRange(int(start * 60), int(end * 60))

        for vehicle_id in range(num_vehicles):
            start_index = routing.Start(vehicle_id)
            end_index = routing.End(vehicle_id)
            start_node = manager.IndexToNode(start_index)
            end_node = manager.IndexToNode(end_index)
            s_start, s_end = time_windows[start_node]
            e_start, e_end = time_windows[end_node]
            time_dim.CumulVar(start_index).SetRange(int(s_start * 60), int(s_end * 60))
            time_dim.CumulVar(end_index).SetRange(int(e_start * 60), int(e_end * 60))

    # Allow dropping orders if infeasible
    if allow_dropping:
        for node in range(n_nodes):
            # Do not allow dropping depot nodes
            if node in set(starts + ends):
                continue
            routing.AddDisjunction([manager.NodeToIndex(node)], drop_penalty)

    # Search parameters
    params = pywrapcp.DefaultRoutingSearchParameters()
    params.time_limit.seconds = time_limit_sec
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC

    solution = routing.SolveWithParameters(params)
    routes = []
    route_dist_km = []
    route_dur_min = []
    unassigned = []

    if solution:
        for v in range(num_vehicles):
            index = routing.Start(v)
            route = []
            total_dist = 0.0
            total_time_sec = 0
            while not routing.IsEnd(index):
                node = manager.IndexToNode(index)
                route.append(node)
                prev_index = index
                index = solution.Value(routing.NextVar(index))
                next_node = manager.IndexToNode(index)
                total_dist += float(distance_matrix_km[node][next_node])
                total_time_sec += int(time_matrix_sec[node][next_node] + service_times_sec[node])
            route.append(manager.IndexToNode(index))
            routes.append(route)
            route_dist_km.append(float(total_dist))
            route_dur_min.append(float(total_time_sec / 60.0))

        for node in range(n_nodes):
            if node in set(starts + ends):
                continue
            index = manager.NodeToIndex(node)
            if solution.Value(routing.NextVar(index)) == index:
                unassigned.append(node)
    else:
        logger.warning("OR-Tools VRP: No solution found within time limit.")

    return {
        "routes": routes,
        "route_dist_km": route_dist_km,
        "route_dur_min": route_dur_min,
        "unassigned": unassigned,
    }

# ===========================================================
# Greedy ML-Aware Heuristic
# ===========================================================
def greedy_vrp(
    orders_df: pd.DataFrame,
    preds: Optional[List[float]] = None,
    drivers: int = 3,
    traffic_factor: bool = True
) -> List[Dict[str, Any]]:
    """Greedy heuristic that assigns deliveries by predicted delay + distance."""
    df = orders_df.reset_index(drop=True).copy()
    if preds is None:
        preds = [0.0] * len(df)

    df["pred_delay"] = list(map(float, preds))
    df["priority"] = df["pred_delay"] + df["distance_km"]

    if traffic_factor and "traffic" in df.columns:
        weights = {"low": 0.8, "medium": 1.0, "high": 1.3}
        df["priority"] *= df["traffic"].map(weights).fillna(1.0)

    drivers_state = [{"id": i, "route": [], "load": 0.0} for i in range(drivers)]

    for _, row in df.sort_values("priority", ascending=False).iterrows():
        best = min(drivers_state, key=lambda d: d["load"])
        est_cost = float(row["distance_km"]) + float(row["pred_delay"])
        best["route"].append(row["order_id"])
        best["load"] += est_cost

    return drivers_state

# ===========================================================
# Main Planner
# ===========================================================
def _minutes_since_start(dt: datetime, start_of_day: datetime) -> int:
    return int((dt - start_of_day).total_seconds() / 60)


def plan_routes(
    orders: List[Dict[str, Any]],
    drivers: int = 3,
    method: str = "greedy",
    use_ml_predictions: bool = True,
    model_predictor: Optional[Any] = None,
    ortools_time_limit: int = 10,
    avg_speed_kmph: float = 30.0,
    service_time_min_default: int = 5,
    drivers_data: Optional[List[Dict[str, Any]]] = None,
    distance_matrix_km: Optional[np.ndarray] = None,
    time_matrix_sec: Optional[np.ndarray] = None,
    depot_coords: Optional[Tuple[float, float]] = None,
) -> Dict[str, Any]:
    """
    High-level planner: integrates ML predictions + VRP optimization.
    Adds optional capacity/time-window handling for OR-Tools.
    Gracefully falls back to greedy when OR-Tools is unavailable or fails.

    Args:
        depot_coords: (lat, lng) of warehouse depot. When provided, all
            drivers share this single depot (warehouse-centric routing).
    """
    df = pd.DataFrame(orders)
    if df.empty:
        return {"routes": [], "method": method, "n_orders": 0, "debug": "no orders"}

    if "distance_km" not in df.columns or df["distance_km"].isnull().any():
        # Use depot as reference for distance calc when available
        if depot_coords:
            ref_lat, ref_lon = depot_coords
        else:
            ref_lat = float(df["lat"].astype(float).mean())
            ref_lon = float(df["lon"].astype(float).mean())
        df["distance_km"] = df.apply(
            lambda r: haversine(ref_lat, ref_lon, float(r["lat"]), float(r["lon"])),
            axis=1
        )

    preds = None
    if use_ml_predictions and model_predictor is not None:
        try:
            preds = model_predictor(df)
        except Exception as e:
            logger.exception("Model predictor failed — using zero delays: %s", e)
            preds = [0.0] * len(df)

    # ------------------ Greedy Heuristic ------------------
    if method == "greedy":
        routes = greedy_vrp(df, preds=preds, drivers=drivers)
        avg_load = np.mean([r["load"] for r in routes]) if routes else 0.0
        return {
            "routes": routes,
            "method": "greedy",
            "n_orders": len(df),
            "debug": {"avg_load": float(avg_load), "solver": "Greedy Heuristic"},
        }

    # ------------------ OR-Tools Solver -------------------
    elif method == "ortools":
        if not _ORTOOLS_AVAILABLE:
            logger.warning("OR-Tools not available. Falling back to greedy heuristic.")
            routes = greedy_vrp(df, preds=preds, drivers=drivers)
            avg_load = np.mean([r["load"] for r in routes]) if routes else 0.0
            return {
                "routes": routes,
                "method": "greedy_fallback",
                "n_orders": len(df),
                "debug": {
                    "avg_load": float(avg_load),
                    "solver": "Greedy Heuristic (fallback: OR-Tools not installed)",
                },
            }

        try:
            drivers_payload = drivers_data or []
            num_vehicles = len(drivers_payload) if drivers_payload else drivers

            # Build depot node(s)
            depot_points = []

            if depot_coords:
                # Warehouse-centric: single shared depot for all vehicles
                depot_points = [depot_coords]
                logger.info("Using warehouse depot at (%.4f, %.4f)", depot_coords[0], depot_coords[1])
            elif drivers_payload:
                # Legacy: per-driver depot from GPS
                for d in drivers_payload:
                    lat = d.get("current_lat")
                    lng = d.get("current_lng")
                    if lat is None or lng is None:
                        lat = float(df["lat"].astype(float).mean())
                        lng = float(df["lon"].astype(float).mean())
                    depot_points.append((float(lat), float(lng)))
            else:
                depot_points = [(float(df["lat"].astype(float).mean()), float(df["lon"].astype(float).mean()))]
                num_vehicles = max(num_vehicles, 1)

            order_points = list(zip(df["lat"].astype(float), df["lon"].astype(float)))
            points = depot_points + order_points
            if distance_matrix_km is None:
                distance_matrix = build_distance_matrix(points)
            else:
                distance_matrix = distance_matrix_km

            depot_count = len(depot_points)

            if depot_coords:
                # Shared depot: all vehicles start/end at node 0
                starts = [0] * num_vehicles
                ends = [0] * num_vehicles
            elif drivers_payload:
                starts = list(range(depot_count))
                ends = list(range(depot_count))
            else:
                starts = [0] * num_vehicles
                ends = [0] * num_vehicles

            capacities = []
            if drivers_payload:
                for d in drivers_payload:
                    cap = d.get("vehicle_capacity", 10)
                    capacities.append(int(max(cap, 1)))
            else:
                capacities = [10] * num_vehicles

            # Demands and service times
            demands = [0] * depot_count
            service_times = [0] * depot_count
            for _, row in df.iterrows():
                demand = int(max(1, round(float(row.get("weight", 1.0)))))
                demands.append(demand)
                service_times.append(int(row.get("service_time_min", service_time_min_default)))

            # Time windows (minutes since start of day)
            now = datetime.utcnow()
            base_day = datetime(now.year, now.month, now.day)
            tw = []

            # Depot time windows
            # If shared depot (depot_count=1), use aggregate shift or default
            # If per-driver depot, use per-driver shift
            for i in range(depot_count):
                d = drivers_payload[i] if drivers_payload and i < len(drivers_payload) else {}
                
                # If shared depot, maybe use earliest start and latest end of all drivers?
                # For now, simplistic approach: if shared, use first driver or default.
                
                shift_start = d.get("shift_start")
                shift_end = d.get("shift_end")
                
                if isinstance(shift_start, datetime) and isinstance(shift_end, datetime):
                    start_min = _minutes_since_start(shift_start, base_day)
                    end_min = _minutes_since_start(shift_end, base_day)
                else:
                    start_min = 0
                    end_min = 24 * 60
                
                start_min = max(0, start_min)
                end_min = max(start_min + 1, end_min)
                tw.append((start_min, end_min))

            for _, row in df.iterrows():
                start_dt = row.get("time_window_start")
                end_dt = row.get("time_window_end")
                if isinstance(start_dt, datetime) and isinstance(end_dt, datetime):
                    start_min = _minutes_since_start(start_dt, base_day)
                    end_min = _minutes_since_start(end_dt, base_day)
                else:
                    start_min = 0
                    end_min = 24 * 60
                start_min = max(0, start_min)
                end_min = max(start_min + 1, end_min)
                tw.append((start_min, end_min))

            result = ortools_vrp(
                distance_matrix_km=distance_matrix,
                num_vehicles=num_vehicles,
                starts=starts,
                ends=ends,
                capacities=capacities,
                demands=demands,
                time_windows=tw,
                service_times_min=service_times,
                avg_speed_kmph=avg_speed_kmph,
                time_matrix_sec=time_matrix_sec,
                time_limit_sec=ortools_time_limit,
                allow_dropping=True,
                drop_penalty=100000,
            )

            routes_out = []
            for i, nodes in enumerate(result["routes"]):
                # Map node indices to order_ids (skip depot nodes)
                order_ids = []
                for idx in nodes:
                    if idx < depot_count:
                        continue
                    order_idx = idx - depot_count
                    if order_idx < len(df):
                        order_ids.append(df.iloc[order_idx]["order_id"])

                routes_out.append({
                    "id": i,
                    "route": order_ids,
                    "load": float(result["route_dist_km"][i]) if i < len(result["route_dist_km"]) else 0.0,
                    "duration_min": float(result["route_dur_min"][i]) if i < len(result["route_dur_min"]) else 0.0,
                })

            unassigned_order_ids = []
            for node_idx in result["unassigned"]:
                if node_idx >= depot_count:
                    order_idx = node_idx - depot_count
                    if order_idx < len(df):
                        unassigned_order_ids.append(df.iloc[order_idx]["order_id"])

            avg_load = np.mean([r["load"] for r in routes_out]) if routes_out else 0.0
            return {
                "routes": routes_out,
                "method": "ortools",
                "n_orders": len(df),
                "unassigned": unassigned_order_ids,
                "debug": {
                    "avg_load": float(avg_load),
                    "solver": "OR-Tools VRP",
                    "vehicles": num_vehicles,
                    "avg_speed_kmph": avg_speed_kmph,
                },
            }

        except Exception as e:
            logger.exception("OR-Tools VRP crashed. Falling back to greedy heuristic: %s", e)
            routes = greedy_vrp(df, preds=preds, drivers=drivers)
            avg_load = np.mean([r["load"] for r in routes]) if routes else 0.0
            return {
                "routes": routes,
                "method": "greedy_fallback",
                "n_orders": len(df),
                "debug": {
                    "avg_load": float(avg_load),
                    "solver": "Greedy Heuristic (fallback: OR-Tools exception)",
                    "error": str(e),
                },
            }
        

    else:
        raise ValueError(f"Unknown method: {method}")

# ===========================================================
# CLI Demo
# ===========================================================
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    sample_orders = [
        {
            "order_id": f"O{i}",
            "lat": 12.9 + i * 0.01,
            "lon": 77.6 + i * 0.01,
            "distance_km": round(2 + i * 1.5, 2),
            "traffic": "medium",
            "weather": "clear",
        }
        for i in range(6)
    ]

    def mock_predictor(df_input: pd.DataFrame):
        return (df_input["distance_km"] * 1.2).tolist()

    print("=== Greedy plan ===")
    out = plan_routes(sample_orders, drivers=2, method="greedy", model_predictor=mock_predictor)
    print(out["routes"])

    if _ORTOOLS_AVAILABLE:
        print("\n=== OR-Tools plan ===")
        out2 = plan_routes(sample_orders, drivers=2, method="ortools")
        print(out2["routes"])
    else:
        print("\n⚠️ OR-Tools not installed — skipping advanced solver (greedy will be used as fallback in app).")
