import logging
from typing import List, Tuple
import math
import requests
import numpy as np

from src.backend.app.core.config import settings

logger = logging.getLogger(__name__)


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate haversine distance in kilometers."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) *
         math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class RoutingService:
    """
    OSRM routing integration for real road travel times.

    Uses OSRM Table API to fetch distance and duration matrices.
    Falls back to haversine distance if OSRM is unavailable.
    """

    @staticmethod
    def get_osrm_table(points: List[Tuple[float, float]]) -> Tuple[np.ndarray, np.ndarray]:
        """
        Fetch distance and duration matrices from OSRM.

        Args:
            points: List of (lat, lon) tuples.

        Returns:
            (distance_km, duration_sec) matrices as numpy arrays.
        """
        if not points:
            return np.array([[]]), np.array([[]])

        if len(points) > settings.OSRM_MAX_POINTS:
            raise ValueError(
                f"OSRM max points exceeded: {len(points)} > {settings.OSRM_MAX_POINTS}"
            )

        base_url = settings.OSRM_BASE_URL.rstrip("/")
        profile = settings.OSRM_PROFILE
        coords = ";".join([f"{lon},{lat}" for lat, lon in points])

        url = f"{base_url}/table/v1/{profile}/{coords}"
        params = {"annotations": "duration,distance"}

        logger.info("Requesting OSRM table: %s", url)
        try:
            response = requests.get(url, params=params, timeout=settings.OSRM_TIMEOUT_SEC)
            if response.status_code != 200:
                logger.error(f"OSRM error {response.status_code}: {response.text}")
                if settings.OSRM_FALLBACK_HAVERSINE:
                    logger.info("Falling back to haversine distance calculation")
                    return RoutingService._haversine_fallback(points)
                raise RuntimeError(f"OSRM error {response.status_code}: {response.text}")

            data = response.json()
            if data.get("code") != "Ok":
                logger.error(f"OSRM response error: {data}")
                if settings.OSRM_FALLBACK_HAVERSINE:
                    logger.info("Falling back to haversine distance calculation")
                    return RoutingService._haversine_fallback(points)
                raise RuntimeError(f"OSRM response error: {data}")

            distances_m = np.array(data.get("distances", []), dtype=float)
            durations_s = np.array(data.get("durations", []), dtype=float)

            if distances_m.size == 0 or durations_s.size == 0:
                logger.error("OSRM returned empty matrices")
                if settings.OSRM_FALLBACK_HAVERSINE:
                    logger.info("Falling back to haversine distance calculation")
                    return RoutingService._haversine_fallback(points)
                raise RuntimeError("OSRM returned empty matrices")

            distances_km = distances_m / 1000.0
            durations_sec = durations_s

            return distances_km, durations_sec
        
        except requests.exceptions.RequestException as e:
            logger.error(f"OSRM request failed: {e}")
            if settings.OSRM_FALLBACK_HAVERSINE:
                logger.info("Falling back to haversine distance calculation")
                return RoutingService._haversine_fallback(points)
            raise

    @staticmethod
    def _haversine_fallback(points: List[Tuple[float, float]]) -> Tuple[np.ndarray, np.ndarray]:
        """
        Fallback to haversine distance calculation.
        
        Uses a simple speed estimate to convert distance to duration.
        
        Args:
            points: List of (lat, lon) tuples
        
        Returns:
            (distance_km, duration_sec) matrices
        """
        n = len(points)
        distances_km = np.zeros((n, n), dtype=float)
        
        for i in range(n):
            for j in range(n):
                if i != j:
                    distances_km[i, j] = _haversine(
                        points[i][0], points[i][1],
                        points[j][0], points[j][1]
                    )
        
        # Estimate duration assuming average speed of ~30 km/h
        avg_speed_kmph = 30.0
        durations_sec = (distances_km / avg_speed_kmph) * 3600
        
        return distances_km, durations_sec
