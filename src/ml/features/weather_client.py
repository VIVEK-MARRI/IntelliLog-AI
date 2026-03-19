"""
Weather data client for OpenWeatherMap API.
Provides weather conditions for ML feature engineering.
"""

import logging
from typing import Optional, Dict, Any

import aiohttp
from prometheus_client import Counter, Histogram

from src.backend.app.core.config import settings

logger = logging.getLogger(__name__)

# Prometheus metrics
weather_api_calls = Counter(
    "weather_api_calls_total",
    "Total weather API calls",
    ["status"],
)

weather_api_duration = Histogram(
    "weather_api_duration_seconds",
    "Duration of weather API calls",
)


class WeatherClient:
    """OpenWeatherMap API client for weather conditions."""

    BASE_URL = "https://api.openweathermap.org/data/2.5/weather"
    WEATHER_SEVERITY_MAP = {
        "clear": 0,
        "clouds": 0,  # Few clouds
        "drizzle": 1,  # Light rain
        "rain": 2,  # Rain
        "thunderstorm": 2,  # Heavy weather
        "snow": 3,  # Snow
        "mist": 1,
        "smoke": 1,
        "haze": 1,
        "dust": 1,
        "fog": 1,
        "sand": 1,
        "ash": 1,
        "squall": 2,
        "tornado": 3,
    }

    def __init__(self, api_key: str = None):
        """Initialize weather client."""
        self.api_key = api_key or settings.OPENWEATHER_API_KEY
        self.session = None

    async def initialize(self):
        """Initialize async session."""
        self.session = aiohttp.ClientSession()

    async def close(self):
        """Close async session."""
        if self.session:
            await self.session.close()

    async def get_weather(
        self, lat: float, lng: float
    ) -> Optional[Dict[str, Any]]:
        """
        Get current weather for coordinates.

        Returns:
            {
                "weather": string,  # e.g., "rain"
                "severity": int,  # 0-3 (clear, rain, heavy_rain, snow)
                "temp_c": float,
                "humidity": int,
                "wind_speed": float,
                "description": string
            }
        """
        try:
            import time

            start_time = time.time()

            params = {
                "lat": lat,
                "lon": lng,
                "appid": self.api_key,
                "units": "metric",
            }

            async with self.session.get(
                self.BASE_URL, params=params, timeout=aiohttp.ClientTimeout(total=5)
            ) as resp:
                if resp.status != 200:
                    logger.error(f"Weather API error: {resp.status}")
                    weather_api_calls.labels(status="error").inc()
                    return None

                data = await resp.json()

                weather_main = data.get("weather", [{}])[0].get("main", "").lower()
                severity = self.WEATHER_SEVERITY_MAP.get(weather_main, 0)

                result = {
                    "weather": weather_main,
                    "severity": severity,
                    "temp_c": data.get("main", {}).get("temp"),
                    "humidity": data.get("main", {}).get("humidity"),
                    "wind_speed": data.get("wind", {}).get("speed"),
                    "description": data.get("weather", [{}])[0].get("description", ""),
                }

                duration = time.time() - start_time
                weather_api_duration.observe(duration)
                weather_api_calls.labels(status="success").inc()

                logger.debug(f"Got weather for ({lat}, {lng}): {weather_main}")
                return result

        except Exception as e:
            logger.error(f"Error fetching weather: {e}")
            weather_api_calls.labels(status="error").inc()
            return None

    async def __aenter__(self):
        """Async context manager entry."""
        await self.initialize()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()
