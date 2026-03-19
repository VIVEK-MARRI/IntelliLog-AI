"""
Traffic API client with Google Maps Distance Matrix and HERE API fallback.
Handles batch requests, retry logic, and cost tracking.
"""

import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any

import aiohttp
import requests
from prometheus_client import Counter, Histogram

from src.backend.app.core.config import settings

logger = logging.getLogger(__name__)

# Prometheus metrics
traffic_api_calls = Counter(
    "traffic_api_calls_total",
    "Total traffic API calls",
    ["api", "status"],
)

traffic_api_cost = Counter(
    "traffic_api_cost_usd",
    "Cumulative cost of traffic API calls",
    ["api"],
)

traffic_api_duration = Histogram(
    "traffic_api_duration_seconds",
    "Duration of traffic API calls",
    ["api"],
)


class LatLon:
    """Latitude/Longitude coordinate."""

    def __init__(self, lat: float, lng: float):
        """Initialize coordinate."""
        if not (-90 <= lat <= 90):
            raise ValueError(f"Latitude must be -90 to 90, got {lat}")
        if not (-180 <= lng <= 180):
            raise ValueError(f"Longitude must be -180 to 180, got {lng}")
        self.lat = lat
        self.lng = lng

    def __str__(self) -> str:
        return f"{self.lat},{self.lng}"

    def __hash__(self):
        return hash((self.lat, self.lng))

    def __eq__(self, other):
        if not isinstance(other, LatLon):
            return False
        return self.lat == other.lat and self.lng == other.lng


class TrafficData:
    """Result of travel time query."""

    def __init__(
        self,
        duration_seconds: float,
        duration_in_traffic_seconds: float,
        distance_meters: float,
    ):
        """Initialize traffic data."""
        self.duration_seconds = duration_seconds
        self.duration_in_traffic_seconds = duration_in_traffic_seconds
        self.distance_meters = distance_meters
        self.traffic_ratio = (
            duration_in_traffic_seconds / duration_seconds
            if duration_seconds > 0
            else 1.0
        )

    def to_dict(self) -> Dict[str, float]:
        """Convert to dictionary."""
        return {
            "duration_seconds": self.duration_seconds,
            "duration_in_traffic_seconds": self.duration_in_traffic_seconds,
            "distance_meters": self.distance_meters,
            "traffic_ratio": self.traffic_ratio,
        }


class GoogleMapsTrafficClient:
    """Google Maps Distance Matrix API client."""

    API_NAME = "google_maps"
    BASE_URL = "https://maps.googleapis.com/maps/api/distancematrix/json"
    # Cost per request roughly estimated at $0.005 per element
    # (25x25 = 625 elements per request)
    COST_PER_REQUEST = 0.005 * 625 / 1000  # Simplified: ~$0.003 per request

    def __init__(self, api_key: str = None):
        """Initialize Google Maps client."""
        self.api_key = api_key or settings.GOOGLE_MAPS_API_KEY
        self.session = None

    async def initialize(self):
        """Initialize async session."""
        self.session = aiohttp.ClientSession()

    async def close(self):
        """Close async session."""
        if self.session:
            await self.session.close()

    async def get_travel_times(
        self,
        origins: List[LatLon],
        destinations: List[LatLon],
        departure_time: str = "now",
    ) -> Dict[int, Dict[int, TrafficData]]:
        """
        Get travel times between origins and destinations.

        Args:
            origins: List of origin coordinates
            destinations: List of destination coordinates
            departure_time: 'now' or unix timestamp

        Returns:
            Matrix: [origin_idx][dest_idx] = TrafficData
        """
        try:
            # Batch requests to stay within limits (max 25x25 per call)
            # Google API limit: 100 elements max per request, but 25x25 is practical
            results = {}

            for origin_batch in self._batch(origins, 25):
                for dest_batch in self._batch(destinations, 25):
                    batch_result = await self._request_batch(
                        origin_batch, dest_batch, departure_time
                    )

                    # Store results
                    for i, origin_idx in enumerate(
                        [origins.index(o) for o in origin_batch]
                    ):
                        if origin_idx not in results:
                            results[origin_idx] = {}

                        for j, dest_idx in enumerate(
                            [destinations.index(d) for d in dest_batch]
                        ):
                            if i < len(batch_result) and j < len(batch_result[i]):
                                results[origin_idx][dest_idx] = batch_result[i][j]

            logger.info(
                f"Retrieved travel times for {len(origins)}x{len(destinations)} matrix"
            )
            traffic_api_calls.labels(api=self.API_NAME, status="success").inc()
            traffic_api_cost.labels(api=self.API_NAME).inc(self.COST_PER_REQUEST)

            return results

        except Exception as e:
            logger.error(f"Error getting travel times from Google Maps: {e}")
            traffic_api_calls.labels(api=self.API_NAME, status="error").inc()
            raise

    async def _request_batch(
        self,
        origins: List[LatLon],
        destinations: List[LatLon],
        departure_time: str,
    ) -> List[List[TrafficData]]:
        """Request single batch from Google API."""
        import time

        start_time = time.time()

        try:
            origins_str = "|".join(str(o) for o in origins)
            dests_str = "|".join(str(d) for d in destinations)

            params = {
                "origins": origins_str,
                "destinations": dests_str,
                "key": self.api_key,
                "departure_time": "now" if departure_time == "now" else int(departure_time),
                "traffic_model": "best_guess",
            }

            async with self.session.get(
                self.BASE_URL, params=params, timeout=aiohttp.ClientTimeout(total=10)
            ) as resp:
                response_data = await resp.json()

                if response_data.get("status") != "OK":
                    raise Exception(f"Google API error: {response_data.get('error_message')}")

                # Parse response
                results = []
                for row in response_data["rows"]:
                    row_data = []
                    for element in row["elements"]:
                        if element["status"] == "OK":
                            traffic_data = TrafficData(
                                duration_seconds=element["duration"]["value"],
                                duration_in_traffic_seconds=element.get(
                                    "duration_in_traffic", element["duration"]
                                )["value"],
                                distance_meters=element["distance"]["value"],
                            )
                            row_data.append(traffic_data)
                        else:
                            logger.warning(f"Element error: {element['status']}")
                            row_data.append(None)
                    results.append(row_data)

                duration = time.time() - start_time
                traffic_api_duration.labels(api=self.API_NAME).observe(duration)

                return results

        except asyncio.TimeoutError:
            logger.error("Google Maps API request timed out")
            traffic_api_calls.labels(api=self.API_NAME, status="timeout").inc()
            raise
        except Exception as e:
            logger.error(f"Error in Google Maps batch request: {e}")
            raise

    @staticmethod
    def _batch(items: List, batch_size: int):
        """Yield successive batches."""
        for i in range(0, len(items), batch_size):
            yield items[i : i + batch_size]


class HERETrafficClient:
    """HERE Maps Routing API fallback."""

    API_NAME = "here"
    BASE_URL = "https://router.hereapi.com/v8/routes"
    COST_PER_REQUEST = 0.01  # HERE is more expensive

    def __init__(self, api_key: str = None):
        """Initialize HERE client."""
        self.api_key = api_key or settings.HERE_API_KEY

    async def get_travel_times(
        self,
        origins: List[LatLon],
        destinations: List[LatLon],
        departure_time: str = "now",
    ) -> Dict[int, Dict[int, TrafficData]]:
        """Get travel times using HERE API."""
        try:
            results = {}

            # HERE API is slower, so batch by smaller chunks
            for origin_idx, origin in enumerate(origins):
                results[origin_idx] = {}
                for dest_idx, destination in enumerate(destinations):
                    try:
                        traffic_data = await self._request_single(
                            origin, destination, departure_time
                        )
                        results[origin_idx][dest_idx] = traffic_data
                    except Exception as e:
                        logger.warning(
                            f"HERE request failed for {origin} -> {destination}: {e}"
                        )
                        results[origin_idx][dest_idx] = None

            logger.info(f"Retrieved {len(origins)}x{len(destinations)} travel times from HERE")
            traffic_api_calls.labels(api=self.API_NAME, status="success").inc()
            traffic_api_cost.labels(api=self.API_NAME).inc(self.COST_PER_REQUEST)

            return results

        except Exception as e:
            logger.error(f"Error in HERE API: {e}")
            traffic_api_calls.labels(api=self.API_NAME, status="error").inc()
            raise

    async def _request_single(
        self, origin: LatLon, destination: LatLon, departure_time: str
    ) -> Optional[TrafficData]:
        """Request single route from HERE API."""
        import time

        start_time = time.time()

        try:
            params = {
                "apikey": self.api_key,
                "origin": f"{origin.lat},{origin.lng}",
                "destination": f"{destination.lat},{destination.lng}",
                "return": "summary",
                "departure": "now" if departure_time == "now" else departure_time,
                "routeAttributes": "routeWithTraffic",
            }

            async with aiohttp.ClientSession() as session:
                async with session.get(
                    self.BASE_URL, params=params, timeout=aiohttp.ClientTimeout(total=5)
                ) as resp:
                    response_data = await resp.json()

                    if "routes" not in response_data or not response_data["routes"]:
                        logger.warning(f"No routes found: {response_data}")
                        return None

                    route = response_data["routes"][0]
                    summary = route["summary"]

                    traffic_data = TrafficData(
                        duration_seconds=summary.get("duration", 0),
                        duration_in_traffic_seconds=summary.get("trafficTime", summary.get("duration", 0)),
                        distance_meters=summary.get("length", 0),
                    )

                    duration = time.time() - start_time
                    traffic_api_duration.labels(api=self.API_NAME).observe(duration)

                    return traffic_data

        except Exception as e:
            logger.error(f"Error in HERE single request: {e}")
            raise


class TrafficClient:
    """Main traffic client with Google primary, HERE fallback."""

    def __init__(self):
        """Initialize traffic client."""
        self.google_client = GoogleMapsTrafficClient()
        self.here_client = HERETrafficClient()
        self.max_retries = 3
        self.backoff_factor = 2.0

    async def initialize(self):
        """Initialize async session."""
        await self.google_client.initialize()

    async def close(self):
        """Close async session."""
        await self.google_client.close()

    async def get_travel_times(
        self,
        origins: List[LatLon],
        destinations: List[LatLon],
        departure_time: str = "now",
    ) -> Dict[int, Dict[int, TrafficData]]:
        """
        Get travel times with retry and fallback.

        Returns matrix[origin_idx][dest_idx] = TrafficData or None
        """
        # Try Google first with exponential backoff
        for attempt in range(self.max_retries):
            try:
                logger.info(f"Requesting travel times from Google (attempt {attempt + 1})")
                return await self.google_client.get_travel_times(
                    origins, destinations, departure_time
                )
            except Exception as e:
                logger.warning(
                    f"Google Maps request failed (attempt {attempt + 1}): {e}"
                )
                if attempt < self.max_retries - 1:
                    wait_time = self.backoff_factor ** attempt
                    await asyncio.sleep(wait_time)

        # Fall back to HERE if Google exhausted
        logger.warning("Google Maps exhausted, falling back to HERE API")
        try:
            return await self.here_client.get_travel_times(
                origins, destinations, departure_time
            )
        except Exception as e:
            logger.error(f"HERE API also failed: {e}")
            # Return empty result on complete failure
            return {i: {} for i in range(len(origins))}

    async def __aenter__(self):
        """Async context manager entry."""
        await self.initialize()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()
