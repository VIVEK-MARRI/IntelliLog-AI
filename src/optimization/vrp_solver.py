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

Author: Vivek Marri
Project: IntelliLog-AI
Version: 2.1.0
"""

from __future__ import annotations
from typing import List, Tuple, Dict, Any, Optional
import math
import logging
import numpy as np
import pandas as pd
import random

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
def ortools_vrp(
    distance_matrix: np.ndarray,
    num_vehicles: int = 3,
    depot: int = 0,
    capacities: Optional[List[int]] = None,
    demands: Optional[List[int]] = None,
    time_windows: Optional[List[Tuple[int, int]]] = None,
    time_limit_sec: int = 10,
) -> List[List[int]]:
    """Solve Vehicle Routing Problem using OR-Tools with optional constraints."""
    if not _ORTOOLS_AVAILABLE:
        raise RuntimeError("OR-Tools not available. Install ortools to use this solver.")

    dm = (distance_matrix * 1000).astype(int).tolist()  # meters for precision
    manager = pywrapcp.RoutingIndexManager(len(dm), num_vehicles, depot)
    routing = pywrapcp.RoutingModel(manager)

    # Distance callback
    def distance_callback(from_index, to_index):
        from_node, to_node = manager.IndexToNode(from_index), manager.IndexToNode(to_index)
        return dm[from_node][to_node]

    transit_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_index)

    # Capacities
    if capacities and demands:
        demand_callback = lambda from_index: demands[manager.IndexToNode(from_index)]
        demand_callback_index = routing.RegisterUnaryTransitCallback(demand_callback)
        routing.AddDimensionWithVehicleCapacity(
            demand_callback_index, 0, capacities, True, "Capacity"
        )

    # Time windows
    if time_windows:
        routing.AddDimension(
            transit_index,
            300,  # allow waiting time (5 min buffer)
            36000,  # max 10 hours per route
            False,
            "Time"
        )
        time_dim = routing.GetDimensionOrDie("Time")
        for node_idx, (start, end) in enumerate(time_windows):
            index = manager.NodeToIndex(node_idx)
            time_dim.CumulVar(index).SetRange(start, end)

    # Search parameters
    params = pywrapcp.DefaultRoutingSearchParameters()
    params.time_limit.seconds = time_limit_sec
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC

    solution = routing.SolveWithParameters(params)
    routes = []
    if solution:
        for v in range(num_vehicles):
            index = routing.Start(v)
            route = []
            while not routing.IsEnd(index):
                node = manager.IndexToNode(index)
                route.append(node)
                index = solution.Value(routing.NextVar(index))
            route.append(manager.IndexToNode(index))
            routes.append(route)
    else:
        logger.warning("OR-Tools VRP: No solution found within time limit.")
    return routes

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
def plan_routes(
    orders: List[Dict[str, Any]],
    drivers: int = 3,
    method: str = "greedy",
    use_ml_predictions: bool = True,
    model_predictor: Optional[Any] = None,
    ortools_time_limit: int = 10,
) -> Dict[str, Any]:
    """
    High-level planner: integrates ML predictions + VRP optimization.
    Adds optional capacity/time-window handling for OR-Tools.
    """
    df = pd.DataFrame(orders)
    if df.empty:
        return {"routes": [], "debug": "no orders"}

    points = list(zip(df["lat"].astype(float), df["lon"].astype(float)))
    distance_matrix = build_distance_matrix(points)

    preds = None
    if use_ml_predictions and model_predictor is not None:
        try:
            preds = model_predictor(df)
        except Exception as e:
            logger.exception("Model predictor failed — using zero delays.")
            preds = [0.0] * len(df)

    # ------------------ Greedy Heuristic ------------------
    if method == "greedy":
        routes = greedy_vrp(df, preds=preds, drivers=drivers)
        avg_load = np.mean([r["load"] for r in routes])
        return {
            "routes": routes,
            "method": "greedy",
            "n_orders": len(df),
            "debug": {"avg_load": float(avg_load), "solver": "Greedy Heuristic"},
        }

    # ------------------ OR-Tools Solver -------------------
    elif method == "ortools":
        if not _ORTOOLS_AVAILABLE:
            raise RuntimeError("OR-Tools not available. Install ortools to use this solver.")

        # Add dummy capacities and time windows
        capacities = [15] * drivers
        demands = [random.randint(1, 3) for _ in range(len(df))]
        base_time = random.randint(0, 100)
        time_windows = [(base_time, base_time + 3600 + random.randint(0, 600)) for _ in range(len(df))]

        routes_nodes = ortools_vrp(
            distance_matrix,
            num_vehicles=drivers,
            depot=0,
            capacities=capacities,
            demands=demands,
            time_windows=time_windows,
            time_limit_sec=ortools_time_limit,
        )

        routes_out = []
        for i, nodes in enumerate(routes_nodes):
            order_ids = [df.iloc[idx]["order_id"] for idx in nodes if idx < len(df)]
            total_distance = float(sum(df.iloc[idx]["distance_km"] for idx in nodes if idx < len(df)))
            routes_out.append({"id": i, "route": order_ids, "load": total_distance})

        avg_load = np.mean([r["load"] for r in routes_out]) if routes_out else 0.0
        return {
            "routes": routes_out,
            "method": "ortools",
            "n_orders": len(df),
            "debug": {"avg_load": float(avg_load), "solver": "OR-Tools VRP"},
        }

    else:
        raise ValueError(f"Unknown method: {method}")

# ===========================================================
# CLI Demo
# ===========================================================
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    sample_orders = [
        {"order_id": f"O{i}", "lat": 12.9 + i * 0.01, "lon": 77.6 + i * 0.01,
         "distance_km": round(2 + i * 1.5, 2), "traffic": "medium", "weather": "clear"}
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
        print("\n⚠️ OR-Tools not installed — skipping advanced solver.")
