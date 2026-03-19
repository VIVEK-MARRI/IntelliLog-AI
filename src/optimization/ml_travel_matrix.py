"""
Build ML-informed travel-time matrices for routing.

Provides both a modern MLTravelTimeMatrix class for newer code
and a legacy function-based interface for backward compatibility.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from datetime import datetime, timezone
from math import radians, sin, cos, sqrt, atan2
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd
import redis as redis_lib
from prometheus_client import Gauge

from src.backend.app.core.config import settings
from src.ml.features.store import FeatureStore
from src.ml.features.traffic_cache import TrafficCache
from src.ml.features.traffic_client import LatLon

logger = logging.getLogger(__name__)

matrix_type_used = Gauge(
    "matrix_type_used",
    "Matrix source used for routing (1 means active)",
    ["matrix_type"],
)

def _redis_client() -> redis_lib.Redis:
    return redis_lib.from_url(settings.REDIS_FEATURE_STORE_URL, decode_responses=True)


def _extract_tenant_id(orders: Sequence[Any]) -> str:
    if not orders:
        return "default"

    first = orders[0]
    if isinstance(first, dict):
        return str(first.get("tenant_id", "default"))
    return str(getattr(first, "tenant_id", "default"))


def _extract_driver_point(driver: Any) -> Tuple[float, float]:
    if isinstance(driver, dict):
        lat = driver.get("current_lat")
        lng = driver.get("current_lng", driver.get("current_lon"))
    else:
        lat = getattr(driver, "current_lat", None)
        lng = getattr(driver, "current_lng", getattr(driver, "current_lon", None))

    if lat is None or lng is None:
        raise ValueError("Driver location missing current_lat/current_lng")

    return float(lat), float(lng)


def _extract_order_point(order: Any) -> Tuple[float, float]:
    if isinstance(order, dict):
        lat = order.get("lat")
        lng = order.get("lng", order.get("lon"))
    else:
        lat = getattr(order, "lat", None)
        lng = getattr(order, "lng", getattr(order, "lon", None))

    if lat is None or lng is None:
        raise ValueError("Order location missing lat/lng")

    return float(lat), float(lng)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
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


def _run_async(awaitable: Any) -> Any:
    try:
        return asyncio.run(awaitable)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(awaitable)
        finally:
            loop.close()


def _get_traffic_ratio(traffic_cache: TrafficCache, origin: LatLon, destination: LatLon) -> float:
    try:
        result = traffic_cache.get_cached_travel_time(origin, destination)
        if asyncio.iscoroutine(result):
            result = _run_async(result)
        if isinstance(result, dict):
            ratio = float(result.get("traffic_ratio", 1.0))
            if np.isfinite(ratio) and ratio > 0:
                return ratio
    except Exception as err:  # pragma: no cover - defensive
        logger.debug("Traffic cache lookup failed; using neutral ratio: %s", err)

    return 1.0


def _extract_predicted_minutes(prediction: Any) -> float:
    if isinstance(prediction, dict):
        val = prediction.get("eta_minutes")
        if val is None:
            raise ValueError("Missing eta_minutes in model.predict output")
        pred = float(val)
    elif isinstance(prediction, (list, tuple, np.ndarray, pd.Series)):
        if len(prediction) == 0:
            raise ValueError("Empty prediction output")
        pred = float(prediction[0])
    else:
        pred = float(prediction)

    if not np.isfinite(pred) or pred <= 0:
        raise ValueError(f"Invalid predicted travel time: {pred}")
    return pred


def _predict_minutes(model: Any, feature_row: Dict[str, Any], feature_names: List[str]) -> float:
    feature_df = pd.DataFrame([feature_row])

    for col in feature_names:
        if col not in feature_df.columns:
            feature_df[col] = 0.0
    feature_df = feature_df[feature_names]

    prediction = model.predict(feature_df)
    return _extract_predicted_minutes(prediction)


def build_ml_travel_time_matrix(
    orders: Sequence[Any],
    drivers: Sequence[Any],
    model: Any,
    feature_store: FeatureStore,
    traffic_cache: TrafficCache,
) -> np.ndarray:
    """
    Build an ML-informed pairwise travel-time matrix in minutes.

    Matrix ordering is [drivers..., orders...].
    """
    now = datetime.now(timezone.utc)
    tenant_id = _extract_tenant_id(orders)
    hour_slot = f"{now.hour:02d}_{now.minute // 15}"
    cache_key = f"travel_matrix:{tenant_id}:{now.date().isoformat()}:{hour_slot}"

    redis_client = _redis_client()
    try:
        cached_raw = redis_client.get(cache_key)
        if cached_raw:
            payload = json.loads(cached_raw)
            matrix = payload.get("matrix")
            if isinstance(matrix, list):
                matrix_np = np.array(matrix, dtype=float)
                if matrix_np.ndim == 2:
                    matrix_type = str(payload.get("matrix_type", "ml_predicted"))
                    build_ml_travel_time_matrix.last_matrix_type = matrix_type
                    matrix_type_used.labels(matrix_type=matrix_type).set(1)
                    return matrix_np
    except Exception as cache_err:  # pragma: no cover - cache should not block
        logger.debug("Matrix cache read failed for %s: %s", cache_key, cache_err)

    points: List[Tuple[float, float]] = []
    for driver in drivers:
        points.append(_extract_driver_point(driver))
    for order in orders:
        points.append(_extract_order_point(order))

    n_points = len(points)
    if n_points == 0:
        build_ml_travel_time_matrix.last_matrix_type = "static_fallback"
        matrix_type_used.labels(matrix_type="static_fallback").set(1)
        return np.zeros((0, 0), dtype=float)

    model_feature_names: List[str] = []
    if hasattr(model, "get_metadata"):
        try:
            metadata = model.get_metadata() or {}
            names = metadata.get("feature_names", [])
            if isinstance(names, list):
                model_feature_names = [str(x) for x in names]
        except Exception:
            model_feature_names = []

    # Required core feature set plus any discovered metadata columns.
    required_base = [
        "distance_km",
        "current_traffic_ratio",
        "time_of_day",
        "day_of_week",
        "is_peak_hour",
    ]
    feature_names = list(dict.fromkeys(model_feature_names + required_base))

    matrix = np.zeros((n_points, n_points), dtype=float)
    had_fallback = False

    for i in range(n_points):
        origin_lat, origin_lng = points[i]
        for j in range(n_points):
            if i == j:
                matrix[i, j] = 0.0
                continue

            dest_lat, dest_lng = points[j]
            distance_km = _haversine_km(origin_lat, origin_lng, dest_lat, dest_lng)

            traffic_ratio = _get_traffic_ratio(
                traffic_cache=traffic_cache,
                origin=LatLon(origin_lat, origin_lng),
                destination=LatLon(dest_lat, dest_lng),
            )

            feature_row: Dict[str, Any] = {
                "distance_km": distance_km,
                "current_traffic_ratio": traffic_ratio,
                "time_of_day": now.hour,
                "hour": now.hour,
                "day_of_week": now.weekday(),
                "is_peak_hour": 1 if now.hour in (7, 8, 9, 17, 18, 19) else 0,
            }

            # Augment with optional cached context if available.
            try:
                ctx = feature_store.get_features(entity_id=f"{tenant_id}:routing_context", version="v1") or {}
                if isinstance(ctx, dict):
                    feature_row.update(ctx)
            except Exception:
                pass

            try:
                minutes = _predict_minutes(model, feature_row, feature_names)
                matrix[i, j] = minutes
            except Exception as pred_err:
                had_fallback = True
                logger.debug("ML predict failed for edge %s->%s: %s", i, j, pred_err)
                matrix[i, j] = (distance_km / 30.0) * 60.0

    matrix_type = "static_fallback" if had_fallback else "ml_predicted"
    build_ml_travel_time_matrix.last_matrix_type = matrix_type

    payload = {
        "matrix": matrix.tolist(),
        "matrix_type": matrix_type,
        "updated_at": now.isoformat(),
    }
    try:
        redis_client.set(cache_key, json.dumps(payload), ex=15 * 60)
    except Exception as cache_err:  # pragma: no cover
        logger.debug("Matrix cache write failed for %s: %s", cache_key, cache_err)

    matrix_type_used.labels(matrix_type=matrix_type).set(1)
    return matrix


build_ml_travel_time_matrix.last_matrix_type = "static_fallback"


# ============================================================================
# MODERN CLASS-BASED INTERFACE FOR ML TRAVEL TIME MATRIX
# ============================================================================

def haversine(origin: LatLon, dest: LatLon) -> float:
    """Returns distance in km between two lat/lon points."""
    R = 6371.0
    lat1, lon1 = radians(origin.lat), radians(origin.lng)
    lat2, lon2 = radians(dest.lat), radians(dest.lng)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


class MLTravelTimeMatrix:
    """ML-informed travel time matrix builder for VRP optimization."""

    def __init__(self, model: Any, feature_store: Any, traffic_cache: TrafficCache, 
                 redis_client: redis_lib.Redis, tenant_id: str):
        """Initialize matrix builder with ML model and dependencies.
        
        Args:
            model: XGBoost ETA predictor with predict() method
            feature_store: FeatureStore for contextual features
            traffic_cache: TrafficCache for traffic ratios
            redis_client: Redis client for caching
            tenant_id: Tenant identifier for multi-tenancy
        """
        self.model = model
        self.feature_store = feature_store
        self.traffic_cache = traffic_cache
        self.redis_client = redis_client
        self.tenant_id = tenant_id
        self.fallback_speed_kmh = 30.0
        self._matrix: Optional[np.ndarray] = None

    def _date_hour_slot(self) -> str:
        """Return cache key time slot string like '2026-03-20-14'."""
        now = datetime.now()
        return f"{now.date().isoformat()}-{now.hour:02d}"

    async def build(self, points: List[LatLon]) -> np.ndarray:
        """Build NxN travel time matrix where matrix[i][j] = seconds from point i to j.
        
        Args:
            points: List of LatLon points (drivers first, then orders)
            
        Returns:
            NxN numpy array with travel times in seconds
        """
        n = len(points)

        # Check Redis cache first
        cache_key = f"travel_matrix:{self.tenant_id}:{self._date_hour_slot()}"
        points_hash = hashlib.md5(str(points).encode()).hexdigest()[:8]
        full_key = f"{cache_key}:{points_hash}"

        try:
            cached_bytes = self.redis_client.get(full_key)
            if cached_bytes:
                self._matrix = np.frombuffer(cached_bytes, dtype=np.float64).reshape(n, n)
                logger.debug("Loaded travel matrix from Redis cache")
                return self._matrix
        except Exception as e:
            logger.debug("Redis cache read failed: %s", e)

        # Cache miss - compute matrix
        matrix = await self._compute_matrix(points)

        # Store in Redis with 15-minute TTL
        try:
            self.redis_client.set(full_key, matrix.tobytes(), ex=900)
        except Exception as e:
            logger.warning("Failed to cache travel matrix: %s", e)

        self._matrix = matrix
        return matrix

    async def _compute_matrix(self, points: List[LatLon]) -> np.ndarray:
        """Compute ML-predicted travel time matrix for all point pairs."""
        n = len(points)
        matrix = np.zeros((n, n), dtype=np.float64)
        
        for i in range(n):
            for j in range(n):
                if i == j:
                    matrix[i, j] = 0.0
                else:
                    travel_time_sec = await self._predict_travel_time(points[i], points[j])
                    matrix[i, j] = travel_time_sec
        
        return matrix

    async def _predict_travel_time(self, origin: LatLon, dest: LatLon) -> float:
        """Predict travel time in SECONDS from origin to destination.
        
        Returns the predicted travel time in seconds, with fallback to
        distance-based estimate if ML prediction fails.
        """
        try:
            # Compute haversine distance
            distance_km = haversine(origin, dest)
            
            # Get traffic data
            traffic_data = await self.traffic_cache.get_cached_travel_time(origin, dest)
            traffic_ratio = traffic_data.get("traffic_ratio", 1.0) if isinstance(traffic_data, dict) else 1.0
            
            # Build feature vector
            now = datetime.now()
            hour = now.hour
            day_of_week = now.weekday()
            is_peak = 1 if (7 <= hour <= 10 or 17 <= hour <= 20) and day_of_week < 5 else 0
            
            features = np.array([[
                distance_km,
                hour,
                day_of_week,
                is_peak,
                traffic_ratio,
                traffic_data.get("historical_avg", traffic_ratio) if isinstance(traffic_data, dict) else traffic_ratio,
                traffic_data.get("historical_std", 0.1) if isinstance(traffic_data, dict) else 0.1,
                traffic_data.get("weather_severity", 0) if isinstance(traffic_data, dict) else 0,
                1.0   # vehicle_type_encoded default (car)
            ]])
            
            # Accept both tuple-returning predictors and plain ndarray/list returns.
            prediction_output = self.model.predict(features)
            if isinstance(prediction_output, tuple) and len(prediction_output) >= 1:
                predictions = prediction_output[0]
            else:
                predictions = prediction_output

            if isinstance(predictions, dict):
                travel_time_minutes = float(predictions.get("eta_minutes", 0.0))
            else:
                travel_time_minutes = float(predictions[0])
            
            # Convert to seconds, ensure minimum 60 seconds
            return max(travel_time_minutes * 60, 60.0)
        
        except Exception as e:
            # Fallback to distance-based estimation
            logger.warning("ML travel time prediction failed for %s→%s: %s, using fallback",
                          origin, dest, e)
            distance_km = haversine(origin, dest)
            fallback_seconds = (distance_km / self.fallback_speed_kmh) * 3600
            return max(fallback_seconds, 60.0)

    def to_or_tools_callback(self, manager: Any) -> callable:
        """Return OR-Tools compatible transit callback using built matrix.
        
        Must call build() first to populate the matrix.
        """
        if self._matrix is None:
            raise ValueError("Matrix not built. Call build() first.")
        
        def time_callback(from_index: int, to_index: int) -> int:
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            return int(self._matrix[from_node][to_node])
        
        return time_callback
