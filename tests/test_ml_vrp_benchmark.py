"""Benchmark test for ML-informed routing vs static routing on synthetic data."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Tuple

import numpy as np

from src.backend.app.services.route_optimizer import build_ml_travel_time_matrix
from src.optimization.vrp_solver import plan_routes


@dataclass
class FakeOrder:
    id: str
    lat: float
    lng: float


@dataclass
class FakeDriver:
    id: str
    current_lat: float
    current_lng: float


class FakeFeatureStore:
    def get_features(self, entity_id: str, version: str = "v1") -> Dict[str, str]:
        return {}


class FakeRedis:
    def __init__(self) -> None:
        self._data: Dict[str, str] = {}

    def get(self, key: str) -> str | None:
        return self._data.get(key)

    def set(self, key: str, value: str, ex: int | None = None) -> None:
        self._data[key] = value


class FastETAStub:
    """Model stub that predicts lower travel times than static-speed baseline."""

    version = "v_test_fast"

    def get_metadata(self) -> Dict[str, List[str]]:
        return {}

    def predict(self, df):
        # Approx 55 km/h equivalent in minutes + small handling overhead.
        return (df["distance_km"].astype(float) / 55.0) * 60.0 + 1.5


def _haversine_km(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    lat1, lon1 = np.radians([a[0], a[1]])
    lat2, lon2 = np.radians([b[0], b[1]])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    c = 2 * np.arctan2(
        np.sqrt(np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2),
        np.sqrt(1 - (np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2)),
    )
    return float(6371.0 * c)


def _build_static_matrix(points: List[Tuple[float, float]], avg_speed_kmh: float = 25.0) -> List[List[float]]:
    n = len(points)
    matrix = [[0.0 for _ in range(n)] for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            dist = _haversine_km(points[i], points[j])
            matrix[i][j] = (dist / avg_speed_kmh) * 60.0
    return matrix


def _compute_duration_and_violations(
    routes: List[Dict[str, object]],
    orders: List[Dict[str, object]],
    drivers: List[Dict[str, object]],
    travel_matrix_min: List[List[float]],
) -> Tuple[float, int]:
    order_id_to_idx = {o["order_id"]: idx for idx, o in enumerate(orders)}
    driver_count = len(drivers)

    total_duration = 0.0
    violations = 0

    for route_index, route in enumerate(routes):
        if route_index >= driver_count:
            break

        current_node = route_index
        elapsed = 0.0
        for order_id in route.get("route", []):
            order_idx = order_id_to_idx[order_id]
            order_node = driver_count + order_idx
            elapsed += float(travel_matrix_min[current_node][order_node])

            tw_start = float(orders[order_idx].get("tw_start_min", 0.0))
            tw_end = float(orders[order_idx].get("tw_end_min", 24 * 60.0))

            if elapsed > tw_end:
                violations += 1
            if elapsed < tw_start:
                elapsed = tw_start

            elapsed += 5.0  # service time
            current_node = order_node

        total_duration += elapsed

    return total_duration, violations


def test_ml_routes_reduce_time_window_violations(monkeypatch):
    # Synthetic geo layout: clustered deliveries with tight windows.
    now = datetime.utcnow()
    drivers = [
        {"driver_id": "d1", "current_lat": 12.9716, "current_lng": 77.5946, "vehicle_capacity": 15},
        {"driver_id": "d2", "current_lat": 12.9616, "current_lng": 77.6046, "vehicle_capacity": 15},
    ]

    orders: List[Dict[str, object]] = []
    for i in range(20):
        lat = 12.92 + (i % 5) * 0.01
        lng = 77.55 + (i // 5) * 0.015
        tw_start = 15.0 + (i % 4) * 10.0
        tw_end = 55.0 + (i % 4) * 12.0
        orders.append(
            {
                "order_id": f"o{i+1}",
                "lat": lat,
                "lon": lng,
                "weight": 1.0,
                "time_window_start": now + timedelta(minutes=tw_start),
                "time_window_end": now + timedelta(minutes=tw_end),
                "service_time_min": 5,
                "tw_start_min": tw_start,
                "tw_end_min": tw_end,
                "tenant_id": "tenant-benchmark",
            }
        )

    fake_redis = FakeRedis()
    monkeypatch.setattr("src.backend.app.services.route_optimizer._get_redis_client", lambda: fake_redis)

    ml_orders = [FakeOrder(id=o["order_id"], lat=o["lat"], lng=o["lon"]) for o in orders]
    ml_drivers = [FakeDriver(id=d["driver_id"], current_lat=d["current_lat"], current_lng=d["current_lng"]) for d in drivers]

    ml_matrix, _ = build_ml_travel_time_matrix(
        orders=ml_orders,
        drivers=ml_drivers,
        model=FastETAStub(),
        feature_store=FakeFeatureStore(),
        tenant_id="tenant-benchmark",
        avg_speed_kmh=25.0,
    )

    points = [(d["current_lat"], d["current_lng"]) for d in drivers] + [(o["lat"], o["lon"]) for o in orders]
    static_matrix = _build_static_matrix(points, avg_speed_kmh=25.0)

    ml_result = plan_routes(
        orders=orders,
        drivers=len(drivers),
        method="ortools",
        use_ml_predictions=False,
        drivers_data=drivers,
        travel_time_matrix=np.array(ml_matrix, dtype=float),
    )

    static_result = plan_routes(
        orders=orders,
        drivers=len(drivers),
        method="ortools",
        use_ml_predictions=False,
        drivers_data=drivers,
        travel_time_matrix=np.array(static_matrix, dtype=float),
    )

    ml_duration, ml_violations = _compute_duration_and_violations(ml_result["routes"], orders, drivers, ml_matrix)
    static_duration, static_violations = _compute_duration_and_violations(static_result["routes"], orders, drivers, static_matrix)

    assert ml_violations < static_violations
    assert ml_duration < static_duration
