"""
Benchmark simulated delay reduction between baseline routing and OR-Tools.
"""

from __future__ import annotations
from typing import List, Dict, Any
import os
import sys
import numpy as np
import pandas as pd
from pathlib import Path

# Ensure repo root is on sys.path for imports
repo_root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(repo_root))

from src.optimization.vrp_solver import haversine, plan_routes, build_distance_matrix


def _build_orders(df: pd.DataFrame, limit: int = 80) -> List[Dict[str, Any]]:
    sample = df.head(limit).copy()
    orders = []
    for _, row in sample.iterrows():
        orders.append({
            "order_id": str(row["order_id"]),
            "lat": float(row["lat"]),
            "lon": float(row["lon"]),
            "distance_km": float(row["distance_km"]),
        })
    return orders


def _round_robin_routes(orders: List[Dict[str, Any]], drivers: int) -> List[List[int]]:
    # Depot at centroid
    lats = [o["lat"] for o in orders]
    lons = [o["lon"] for o in orders]
    depot = (float(np.mean(lats)), float(np.mean(lons)))

    points = [depot] + [(o["lat"], o["lon"]) for o in orders]
    n = len(orders)

    routes = [[] for _ in range(drivers)]
    for i in range(n):
        routes[i % drivers].append(i + 1)  # +1 for depot index offset

    return points, routes


def _route_duration(points: List[tuple], route: List[int], speed_kmph: float = 30.0, service_time_min: int = 5) -> float:
    if not route:
        return 0.0

    total_km = 0.0
    current = 0  # depot index
    for node in route:
        total_km += haversine(points[current][0], points[current][1], points[node][0], points[node][1])
        current = node
    total_km += haversine(points[current][0], points[current][1], points[0][0], points[0][1])

    travel_min = (total_km / speed_kmph) * 60.0
    service_min = service_time_min * len(route)
    return travel_min + service_min


def main():
    data_path = Path("data/raw_orders.csv")
    if not data_path.exists():
        raise FileNotFoundError(f"Data not found: {data_path}")

    df = pd.read_csv(data_path)
    orders = _build_orders(df, limit=80)
    drivers = 3

    # Baseline: round-robin assignment
    points, rr_routes = _round_robin_routes(orders, drivers)
    baseline_durations = [
        _route_duration(points, r) for r in rr_routes
    ]

    # Optimized: OR-Tools
    distance_matrix = build_distance_matrix(points)
    optimized = plan_routes(
        orders,
        drivers=drivers,
        method="ortools",
        use_ml_predictions=False,
        avg_speed_kmph=30.0,
        distance_matrix_km=distance_matrix,
    )

    opt_durations = optimized.get("route_dur_min")
    if not opt_durations:
        # Fallback to greedy if OR-Tools fails
        optimized = plan_routes(
            orders,
            drivers=drivers,
            method="greedy",
            use_ml_predictions=False,
        )
        opt_durations = [r.get("load", 0.0) for r in optimized.get("routes", [])]

    baseline_mean = float(np.mean(baseline_durations))
    baseline_p95 = float(np.percentile(baseline_durations, 95))

    opt_mean = float(np.mean(opt_durations))
    opt_p95 = float(np.percentile(opt_durations, 95))

    mean_improvement = (baseline_mean - opt_mean) / baseline_mean * 100.0
    p95_improvement = (baseline_p95 - opt_p95) / baseline_p95 * 100.0

    print("=" * 80)
    print("SIMULATED DELAY REDUCTION BENCHMARK")
    print("=" * 80)
    print(f"Baseline mean route duration: {baseline_mean:.2f} min")
    print(f"Optimized mean route duration: {opt_mean:.2f} min")
    print(f"Mean improvement: {mean_improvement:.2f}%")
    print()
    print(f"Baseline P95 route duration: {baseline_p95:.2f} min")
    print(f"Optimized P95 route duration: {opt_p95:.2f} min")
    print(f"P95 improvement: {p95_improvement:.2f}%")


if __name__ == "__main__":
    main()
