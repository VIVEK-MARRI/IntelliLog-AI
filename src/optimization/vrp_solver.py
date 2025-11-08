"""
src/optimization/vrp_solver.py

Production-ready route optimization utilities for IntelliLog-AI.

Provides:
- haversine: accurate geodesic distance (km)
- build_distance_matrix: pairwise distance matrix (km) from lat/lon points
- build_graph: networkx graph with 'weight' attribute in km
- shortest_path_dijkstra / shortest_path_astar: path finding on graph
- ortools_vrp: wrapper around OR-Tools to solve VRP (returns routes)
- greedy_vrp: simple ML-aware greedy assigner (assigns high-risk deliveries first)
- plan_routes: convenience function that ties prediction -> optimization

Author: Vivek Yadav
"""

from __future__ import annotations
from typing import List, Tuple, Dict, Any, Optional
import math
import logging

import numpy as np
import pandas as pd

try:
    import networkx as nx
except Exception:
    raise ImportError("networkx is required. pip install networkx")

# OR-Tools is optional — ortools.VRP used if available
try:
    from ortools.constraint_solver import pywrapcp, routing_enums_pb2
    _ORTOOLS_AVAILABLE = True
except Exception:
    _ORTOOLS_AVAILABLE = False

logger = logging.getLogger(__name__)
logger.addHandler(logging.NullHandler())


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Haversine distance between two lat/lon points in kilometers.
    """
    R = 6371.0  # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def build_distance_matrix(points: List[Tuple[float, float]]) -> np.ndarray:
    """
    Build a symmetric pairwise distance matrix (km) for a list of (lat, lon) points.
    """
    n = len(points)
    mat = np.zeros((n, n), dtype=float)
    for i in range(n):
        lat1, lon1 = points[i]
        for j in range(i + 1, n):
            lat2, lon2 = points[j]
            d = haversine(lat1, lon1, lat2, lon2)
            mat[i, j] = d
            mat[j, i] = d
    return mat


def build_graph(points: List[Tuple[float, float]], distance_matrix: Optional[np.ndarray] = None) -> "nx.Graph":
    """
    Build an undirected NetworkX graph from points. Edge weight is distance (km).
    If distance_matrix is provided, use it; otherwise compute with haversine.
    Node ids are indices 0..n-1.
    """
    if distance_matrix is None:
        distance_matrix = build_distance_matrix(points)
    G = nx.Graph()
    n = len(points)
    for i in range(n):
        G.add_node(i, lat=points[i][0], lon=points[i][1])
    for i in range(n):
        for j in range(i + 1, n):
            G.add_edge(i, j, weight=float(distance_matrix[i, j]))
    return G


def shortest_path_dijkstra(graph: "nx.Graph", source: int, target: int) -> Tuple[List[int], float]:
    """
    Return (path_nodes, total_distance_km) using Dijkstra's algorithm.
    """
    path = nx.dijkstra_path(graph, source, target, weight="weight")
    length = nx.dijkstra_path_length(graph, source, target, weight="weight")
    return path, float(length)


def shortest_path_astar(graph: "nx.Graph", source: int, target: int, points: List[Tuple[float, float]]) -> Tuple[List[int], float]:
    """
    Return (path_nodes, total_distance_km) using A* with haversine heuristic between nodes.
    `points` is list of (lat, lon) indexed by node id.
    """
    def heuristic(u: int, v: int) -> float:
        lat1, lon1 = points[u]
        lat2, lon2 = points[v]
        return haversine(lat1, lon1, lat2, lon2)
    path = nx.astar_path(graph, source, target, heuristic=heuristic, weight="weight")
    length = nx.path_weight(graph, path, weight="weight")
    return path, float(length)


def ortools_vrp(distance_matrix: np.ndarray, num_vehicles: int = 1, depot: int = 0, time_limit_sec: int = 10) -> List[List[int]]:
    """
    Solve a CVRP-like problem with OR-Tools using distance matrix (int meters).
    Returns list of routes (each route is list of node indices, including depot at start/end).
    NOTE: OR-Tools expects integer cost; we convert km->meters->int.
    """
    if not _ORTOOLS_AVAILABLE:
        raise RuntimeError("OR-Tools not available. Install ortools to use ortools_vrp.")

    # convert to int cost
    dm = (distance_matrix * 1000).astype(int).tolist()
    manager = pywrapcp.RoutingIndexManager(len(dm), num_vehicles, depot)
    routing = pywrapcp.RoutingModel(manager)

    def distance_callback(from_index: int, to_index: int) -> int:
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return dm[from_node][to_node]

    transit_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_index)

    search_params = pywrapcp.DefaultRoutingSearchParameters()
    search_params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    search_params.time_limit.seconds = time_limit_sec

    solution = routing.SolveWithParameters(search_params)
    routes: List[List[int]] = []
    if solution:
        for v in range(num_vehicles):
            index = routing.Start(v)
            route = []
            while not routing.IsEnd(index):
                node = manager.IndexToNode(index)
                route.append(node)
                index = solution.Value(routing.NextVar(index))
            # append end depot
            route.append(manager.IndexToNode(index))
            routes.append(route)
    else:
        logger.warning("OR-Tools did not find a solution within time limit.")
    return routes


def greedy_vrp(orders_df: pd.DataFrame, preds: Optional[List[float]] = None, drivers: int = 3) -> List[Dict[str, Any]]:
    """
    Simple greedy assignment:
    - orders_df must have columns: order_id, lat, lon, distance_km (dropoff location assumed)
    - preds: list/array of predicted delays for each order (same order as orders_df) or None
    Strategy:
    - Compute a priority score per order (pred_delay + distance_km)
    - Sort descending by priority and assign to driver with smallest current load
    Returns list of drivers: [{"id":0,"route":[order_id,...],"load":float}, ...]
    """
    df = orders_df.reset_index(drop=True).copy()
    if preds is None:
        preds = [0.0] * len(df)
    df["pred_delay"] = list(map(float, preds))
    df["priority"] = df["pred_delay"] + df["distance_km"]  # basic priority
    drivers_state = [{"id": i, "route": [], "load": 0.0} for i in range(drivers)]

    for _, row in df.sort_values("priority", ascending=False).iterrows():
        best = min(drivers_state, key=lambda d: d["load"])
        est_cost = float(row["distance_km"]) + float(row["pred_delay"])
        best["route"].append(row["order_id"])
        best["load"] += est_cost
    return drivers_state


def plan_routes(
    orders: List[Dict[str, Any]],
    drivers: int = 3,
    method: str = "greedy",
    use_ml_predictions: bool = True,
    model_predictor: Optional[Any] = None,
    ortools_time_limit: int = 5
) -> Dict[str, Any]:
    """
    High-level convenience function:
    - orders: list of order dicts with keys: order_id, lat, lon, distance_km, (optional) ...
    - drivers: number of drivers/vehicles
    - method: 'greedy' | 'ortools'  (ortools uses num_vehicles=drivers)
    - use_ml_predictions: if True, will try to call model_predictor(orders_df) to get preds
    - model_predictor: callable that accepts pandas.DataFrame and returns list/np.array of preds
    Returns dict with 'routes' and debug info.
    """
    df = pd.DataFrame(orders)
    if df.empty:
        return {"routes": [], "debug": "no orders"}

    # prepare points list (dropoff)
    points = list(zip(df["lat"].astype(float).tolist(), df["lon"].astype(float).tolist()))
    distance_matrix = build_distance_matrix(points)

    preds = None
    if use_ml_predictions and model_predictor is not None:
        try:
            preds = model_predictor(df)
        except Exception as e:
            logger.exception("Model predictor failed, falling back to no predictions.")
            preds = None

    if method == "greedy":
        routes = greedy_vrp(df, preds=preds, drivers=drivers)
        return {"routes": routes, "method": "greedy", "n_orders": len(df)}
    elif method == "ortools":
        if not _ORTOOLS_AVAILABLE:
            raise RuntimeError("OR-Tools not available. Install ortools to use method='ortools'.")
        ort_routes = ortools_vrp(distance_matrix, num_vehicles=drivers, depot=0, time_limit_sec=ortools_time_limit)
        # convert ortools routes (node indices) to order_ids
        routes_out = []
        for i, r in enumerate(ort_routes):
            # map node indices to order ids (note: depot included; in our small demo depot=0)
            order_ids = [df.iloc[idx]["order_id"] for idx in r]
            routes_out.append({"id": i, "route": order_ids})
        return {"routes": routes_out, "method": "ortools", "n_orders": len(df)}
    else:
        raise ValueError(f"Unknown method: {method}")


# Demo / quick test when run as script
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    # quick synthetic demo (6 random points)
    import random
    from src.etl.ingest import simulate_orders

    demo_df = simulate_orders(n=6, seed=42)
    demo_df = demo_df.reset_index(drop=True)
    # convert to expected orders list
    orders = demo_df.to_dict(orient="records")
    # simple model_predictor mock
    def mock_predictor(df_input: pd.DataFrame):
        # return small predicted delays proportional to distance
        return (df_input["distance_km"] * 1.5).tolist()

    print("=== Greedy plan ===")
    out = plan_routes(orders, drivers=2, method="greedy", model_predictor=mock_predictor)
    print(out["routes"])

    if _ORTOOLS_AVAILABLE:
        print("=== OR-Tools plan ===")
        out2 = plan_routes(orders, drivers=1, method="ortools")
        print(out2["routes"])
    else:
        print("OR-Tools not installed; skip ortools demo.")
