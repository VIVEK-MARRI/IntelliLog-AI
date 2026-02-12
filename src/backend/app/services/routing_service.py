import logging
from typing import List, Tuple
import requests
import numpy as np

from src.backend.app.core.config import settings

logger = logging.getLogger(__name__)


class RoutingService:
    """
    OSRM routing integration for real road travel times.

    Uses OSRM Table API to fetch distance and duration matrices.
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
        response = requests.get(url, params=params, timeout=settings.OSRM_TIMEOUT_SEC)
        if response.status_code != 200:
            raise RuntimeError(f"OSRM error {response.status_code}: {response.text}")

        data = response.json()
        if data.get("code") != "Ok":
            raise RuntimeError(f"OSRM response error: {data}")

        distances_m = np.array(data.get("distances", []), dtype=float)
        durations_s = np.array(data.get("durations", []), dtype=float)

        if distances_m.size == 0 or durations_s.size == 0:
            raise RuntimeError("OSRM returned empty matrices")

        distances_km = distances_m / 1000.0
        durations_sec = durations_s

        return distances_km, durations_sec
