"""
src/optimization/vrp_solver.py

Route optimization utilities for IntelliLog-AI.

Provides:
- haversine: accurate geodesic distance (km)
- build_distance_matrix: pairwise distance matrix (km) from lat/lon points
- build_graph: networkx graph with 'weight' attribute in km
- shortest_path_dijkstra / shortest_path_astar: path finding on graph
- ortools_vrp: wrapper around OR-Tools to solve VRP (returns routes)
- greedy_vrp: simple ML-aware greedy assigner (assigns high-risk deliveries first)
- plan_routes: integrates prediction + optimization for API use

Author: Vivek Marri
Project: IntelliLog-AI
"""

from __future__ import annotations
from typing import List, Tuple, Dict, Any, Optional
import math
import logging
import numpy as np
import pandas as pd

# -------------------------------
# Optional imports
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
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def build_distance_matrix(points: List[Tuple[float, float]]) -> np.ndarray:
    """Build symmetric distance matrix (km) for all points."""
    n = len(points)
    mat = np.zeros((n, n), dtype=float)
    for i in range(n):
        for j in range(i + 1, n):
            d = haversine(points[i][0], points[i][1], points[j][0], points[j][1])
            mat[i, j] = d
            mat[j, i] = d
    return mat


def build_graph(points: List[Tuple[float, float]], distance_matrix: Optional[np.ndarray] = None) -> "nx.Graph":
    """Build undirected NetworkX graph with distance as edge weight."""
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
    """Return path and total distance (km) using Dijkstra."""
    path = nx.dijkstra_path(graph, source, target, weight="weight")
    length = nx.dijkstra_path_length(graph, source, target, weight="weight")
    return path, float(length)


def shortest_path_astar(graph: "nx.Graph", source: int, target: int, points: List[Tuple[float, float]]) -> Tuple[List[int], float]:
    """Return path and total distance (km) using A* search."""
    def heuristic(u, v):
        return haversine(points[u][0], points[u][1], points[v][0], points[v][1])
    path = nx.astar_path(graph, source, target, heuristic=heuristic, weight="weight")
    length = nx.path_weight(graph, path, weight="weight")
    return path, float(length)

# ===========================================================
# VRP Solvers
# ===========================================================

def ortools_vrp(distance_matrix: np.ndarray, num_vehicles: int = 1, depot: int = 0, time_limit_sec: int = 10) -> List[List[int]]:
    """Solve a basic VRP with OR-Tools using the given distance matrix."""
    if not _ORTOOLS_AVAILABLE:
        raise RuntimeError("OR-Tools not available. Install ortools to use this solver.")

    dm = (distance_matrix * 1000).astype(int).tolist()
    manager = pywrapcp.RoutingIndexManager(len(dm), num_vehicles, depot)
    routing = pywrapcp.RoutingModel(manager)

    def distance_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return dm[from_node][to_node]

    transit_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_index)

    search_params = pywrapcp.DefaultRoutingSearchParameters()
    search_params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    search_params.time_limit.seconds = time_limit_sec

    solution = routing.SolveWithParameters(search_params)
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
        logger.warning("OR-Tools: No solution found within time limit.")
    return routes


def greedy_vrp(orders_df: pd.DataFrame, preds: Optional[List[float]] = None, drivers: int = 3) -> List[Dict[str, Any]]:
    """Greedy assignment heuristic using predicted delays and distances."""
    df = orders_df.reset_index(drop=True).copy()
    if preds is None:
        preds = [0.0] * len(df)

    df["pred_delay"] = list(map(float, preds))
    df["priority"] = df["pred_delay"] + df["distance_km"]

    drivers_state = [{"id": i, "route": [], "load": 0.0} for i in range(drivers)]

    for _, row in df.sort_values("priority", ascending=False).iterrows():
        best = min(drivers_state, key=lambda d: d["load"])
        est_cost = float(row["distance_km"]) + float(row["pred_delay"])
        best["route"].append(row["order_id"])
        best["load"] += est_cost

    return drivers_state

# ===========================================================
# Planner (Main Entry)
# ===========================================================

def plan_routes(
    orders: List[Dict[str, Any]],
    drivers: int = 3,
    method: str = "greedy",
    use_ml_predictions: bool = True,
    model_predictor: Optional[Any] = None,
    ortools_time_limit: int = 5
) -> Dict[str, Any]:
    """
    High-level planner: integrates ML predictions + VRP optimization.
    Returns uniform route structure for dashboard and API.
    """
    df = pd.DataFrame(orders)
    if df.empty:
        return {"routes": [], "debug": "no orders"}

    points = list(zip(df["lat"].astype(float).tolist(), df["lon"].astype(float).tolist()))
    distance_matrix = build_distance_matrix(points)

    preds = None
    if use_ml_predictions and model_predictor is not None:
        try:
            preds = model_predictor(df)
        except Exception as e:
            logger.exception("Model predictor failed — using zero delays.")
            preds = [0.0] * len(df)

    if method == "greedy":
        routes = greedy_vrp(df, preds=preds, drivers=drivers)
        return {
            "routes": routes,
            "method": "greedy",
            "n_orders": len(df),
            "debug": {"avg_load": np.mean([r["load"] for r in routes])}
        }

    elif method == "ortools":
        if not _ORTOOLS_AVAILABLE:
            raise RuntimeError("OR-Tools not available. Install ortools to use method='ortools'.")

        ort_routes = ortools_vrp(distance_matrix, num_vehicles=drivers, depot=0, time_limit_sec=ortools_time_limit)
        routes_out = []
        for i, route_nodes in enumerate(ort_routes):
            order_ids = [df.iloc[idx]["order_id"] for idx in route_nodes]
            total_distance = float(np.sum([df.iloc[idx]["distance_km"] for idx in route_nodes if idx < len(df)]))
            routes_out.append({
                "id": i,
                "route": order_ids,
                "load": total_distance  # ✅ always include load
            })
        return {
            "routes": routes_out,
            "method": "ortools",
            "n_orders": len(df),
            "debug": {"avg_load": np.mean([r["load"] for r in routes_out])}
        }

    else:
        raise ValueError(f"Unknown method: {method}")

# ===========================================================
# CLI Demo
# ===========================================================

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    from src.etl.ingest import simulate_orders

    demo_df = simulate_orders(n=6, seed=42)
    orders = demo_df.to_dict(orient="records")

    def mock_predictor(df_input: pd.DataFrame):
        return (df_input["distance_km"] * 1.5).tolist()

    print("=== Greedy plan ===")
    out = plan_routes(orders, drivers=2, method="greedy", model_predictor=mock_predictor)
    print(out["routes"])

    if _ORTOOLS_AVAILABLE:
        print("=== OR-Tools plan ===")
        out2 = plan_routes(orders, drivers=2, method="ortools")
        print(out2["routes"])
    else:
        print("OR-Tools not installed — skipping demo.")
