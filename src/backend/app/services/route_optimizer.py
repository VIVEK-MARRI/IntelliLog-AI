"""
Route optimizer helpers for ML-informed travel-time matrices.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd
import redis
from prometheus_client import Counter, REGISTRY

from src.backend.app.core.config import settings
from src.optimization.vrp_solver import plan_routes
from src.ml.features.store import FeatureStore

if TYPE_CHECKING:
    from src.ml.models.eta_predictor import ETAPredictor

logger = logging.getLogger(__name__)

try:
    vrp_matrix_type_total = Counter(
        "vrp_matrix_type_total",
        "VRP solves by matrix type",
        ["matrix_source", "tenant_id"],
    )
except ValueError:
    vrp_matrix_type_total = REGISTRY._names_to_collectors["vrp_matrix_type_total"]


def _haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Compute haversine distance in kilometers."""
    radius_km = 6371.0
    lat1_rad = np.radians(lat1)
    lon1_rad = np.radians(lon1)
    lat2_rad = np.radians(lat2)
    lon2_rad = np.radians(lon2)

    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad

    a = np.sin(dlat / 2) ** 2 + np.cos(lat1_rad) * np.cos(lat2_rad) * np.sin(dlon / 2) ** 2
    c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))
    return float(radius_km * c)


def _extract_point_from_driver(driver: Any) -> Tuple[float, float]:
    """Extract (lat, lng) from ORM dict-like driver payload."""
    if isinstance(driver, dict):
        lat = driver.get("current_lat")
        lng = driver.get("current_lng")
    else:
        lat = getattr(driver, "current_lat", None)
        lng = getattr(driver, "current_lng", None)

    if lat is None or lng is None:
        raise ValueError("Driver location is missing current_lat/current_lng")
    return float(lat), float(lng)


def _extract_point_from_order(order: Any) -> Tuple[float, float]:
    """Extract (lat, lng) from ORM dict-like order payload."""
    if isinstance(order, dict):
        lat = order.get("lat")
        lng = order.get("lng")
    else:
        lat = getattr(order, "lat", None)
        lng = getattr(order, "lng", None)

    if lat is None or lng is None:
        raise ValueError("Order location is missing lat/lng")
    return float(lat), float(lng)


def _predict_minutes(model: Any, feature_row: Dict[str, Any]) -> float:
    """Predict one edge travel time in minutes with feature alignment."""
    df = pd.DataFrame([feature_row])

    feature_names = model.get_metadata().get("feature_names") if hasattr(model, "get_metadata") else None
    if feature_names:
        for col in feature_names:
            if col not in df.columns:
                df[col] = 0.0
        df = df[feature_names]

    pred = model.predict(df)
    value = float(pred[0])
    if not np.isfinite(value) or value <= 0:
        raise ValueError(f"Invalid predicted travel time: {value}")
    return value


def _get_redis_client() -> redis.Redis:
    """Build Redis client for matrix cache."""
    return redis.from_url(settings.REDIS_FEATURE_STORE_URL, decode_responses=True)


def build_ml_travel_time_matrix(
    orders: Sequence[Any],
    drivers: Sequence[Any],
    model: Any,
    feature_store: FeatureStore,
    tenant_id: str,
    avg_speed_kmh: float = 30.0,
    traffic_condition: str = "medium",
    weather: str = "clear",
) -> Tuple[List[List[float]], str]:
    """
    Build ML-predicted travel-time matrix in minutes for all driver/order points.

    Points ordering:
    - First all driver points
    - Then all order delivery points

    Returns:
    - matrix in minutes
    - matrix_type: ml_predicted or static_fallback
    """
    now = datetime.utcnow()
    cache_key = f"travel_matrix:{tenant_id}:{now.date().isoformat()}:{now.hour:02d}"

    redis_client = _get_redis_client()
    cached_raw = redis_client.get(cache_key)
    if cached_raw:
        try:
            payload = json.loads(cached_raw)
            matrix = payload.get("matrix")
            matrix_type = payload.get("matrix_type", "ml_predicted")
            if isinstance(matrix, list) and matrix:
                return matrix, matrix_type
        except Exception:
            logger.warning("Invalid travel matrix cache payload for key=%s", cache_key)

    points: List[Tuple[float, float]] = []
    for driver in drivers:
        points.append(_extract_point_from_driver(driver))
    for order in orders:
        points.append(_extract_point_from_order(order))

    n_points = len(points)
    if n_points == 0:
        vrp_matrix_type_total.labels(matrix_source="static_fallback", tenant_id=tenant_id).inc()
        return [], "static_fallback"

    default_ctx = feature_store.get_features(entity_id=f"{tenant_id}:routing_context", version="v1") or {}
    traffic_val = str(default_ctx.get("traffic_condition", traffic_condition))
    weather_val = str(default_ctx.get("weather", weather))

    matrix: List[List[float]] = [[0.0 for _ in range(n_points)] for _ in range(n_points)]
    had_fallback = False

    for i in range(n_points):
        origin_lat, origin_lng = points[i]
        for j in range(n_points):
            if i == j:
                continue

            dest_lat, dest_lng = points[j]
            distance_km = _haversine_distance_km(origin_lat, origin_lng, dest_lat, dest_lng)
            feature_row = {
                "distance_km": distance_km,
                "time_of_day": now.hour,
                "hour": now.hour,
                "day_of_week": now.weekday(),
                "traffic_condition": traffic_val,
                "weather": weather_val,
                "weather_condition": weather_val,
                "is_peak_hour": 1 if now.hour in (8, 9, 10, 17, 18, 19) else 0,
                "is_weekend": 1 if now.weekday() >= 5 else 0,
                "weight": 1.0,
                "created_at": now,
            }

            try:
                minutes = _predict_minutes(model, feature_row)
                matrix[i][j] = minutes
            except Exception:
                had_fallback = True
                speed = max(float(avg_speed_kmh), 5.0)
                matrix[i][j] = (distance_km / speed) * 60.0

    matrix_type = "static_fallback" if had_fallback else "ml_predicted"
    payload = {"matrix": matrix, "matrix_type": matrix_type, "updated_at": now.isoformat()}
    redis_client.set(cache_key, json.dumps(payload), ex=900)
    return matrix, matrix_type


def optimize_with_route_optimizer(
    orders: List[Dict[str, Any]],
    drivers_data: List[Dict[str, Any]],
    travel_time_matrix: Optional[List[List[float]]] = None,
    tenant_id: str = "default",
) -> Dict[str, Any]:
    """
    Run OR-Tools with optional travel-time matrix.

    When travel_time_matrix is provided, it is passed through to OR-Tools where
    the transit callback uses:
        lambda i, j: int(travel_time_matrix[i][j] * 60)
    """
    matrix_source = "ml_predicted" if travel_time_matrix is not None else "static_fallback"
    vrp_matrix_type_total.labels(matrix_source=matrix_source, tenant_id=tenant_id).inc()

    result = plan_routes(
        orders=orders,
        drivers=len(drivers_data),
        method="ortools",
        use_ml_predictions=False,
        drivers_data=drivers_data,
        travel_time_matrix=np.array(travel_time_matrix, dtype=float) if travel_time_matrix is not None else None,
    )
    result.setdefault("debug", {})["matrix_source"] = matrix_source
    return result
