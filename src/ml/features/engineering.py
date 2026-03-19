"""
Feature engineering for ETA prediction with traffic awareness.
Adds real-time and historical traffic features to ML model.
"""

import logging
from datetime import datetime
from typing import Optional, Tuple

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from src.ml.features.traffic_cache import TrafficCache
from src.ml.features.weather_client import WeatherClient
from src.ml.features.traffic_client import LatLon

logger = logging.getLogger(__name__)


class TrafficFeatureEngineer:
    """Add traffic-aware features to ML training data."""

    def __init__(self, db_session: Session = None):
        """Initialize feature engineer."""
        self.db = db_session
        self.traffic_cache = TrafficCache(db_session)

    async def enrich_features_with_traffic(
        self, df: pd.DataFrame, refresh_cache: bool = False
    ) -> pd.DataFrame:
        """
        Add traffic features to dataframe.

        Expected input columns:
        - distance_km: float
        - time_of_day: str (morning, afternoon, evening, night)
        - day_of_week: int (0-6)
        - origin_lat, origin_lng: float
        - dest_lat, dest_lng: float (optional)
        - actual_delivery_min: float (optional, for historical aggregation)

        Added output columns:
        - current_traffic_ratio: float (1.0 = free flow)
        - historical_avg_traffic_same_hour: float
        - historical_std_traffic_same_hour: float
        - is_peak_hour: bool
        - weather_severity: int (0-3)
        - effective_travel_time_min: float (adjusted for traffic)
        """
        df = df.copy()

        # Add peak hour indicator
        df["is_peak_hour"] = df.apply(self._is_peak_hour, axis=1)

        # Add traffic features
        logger.info("Adding traffic features...")
        df["current_traffic_ratio"] = df.apply(
            self._get_current_traffic_ratio, axis=1
        )
        df["historical_avg_traffic_same_hour"] = df.apply(
            self._get_historical_avg_traffic, axis=1
        )
        df["historical_std_traffic_same_hour"] = df.apply(
            self._get_historical_std_traffic, axis=1
        )

        # Add weather features
        logger.info("Adding weather features...")
        df["weather_severity"] = df.apply(self._get_weather_severity, axis=1)

        # Add derived feature: effective travel time
        df["effective_travel_time_min"] = df.apply(
            self._compute_effective_travel_time, axis=1
        )

        logger.info(f"Added traffic features to {len(df)} samples")
        return df

    def _is_peak_hour(self, row: pd.Series) -> int:
        """Check if time is peak hour (rush hour)."""
        # Peak hours: 7-10 AM, 5-8 PM on weekdays
        if row["day_of_week"] > 4:  # Weekends
            return 0

        hour = self._extract_hour(row["time_of_day"])

        if 7 <= hour < 10 or 17 <= hour < 20:
            return 1

        return 0

    def _get_current_traffic_ratio(self, row: pd.Series) -> float:
        """
        Get current traffic ratio from cache.

        Fallback to historical average if not available.
        """
        try:
            if "origin_lat" not in row or "origin_lng" not in row:
                # No location data, use historical
                return row.get("historical_avg_traffic_same_hour", 1.0)

            # Zone-based lookup with 1km grid
            origin_zone = self._get_zone_id(row["origin_lat"], row["origin_lng"])
            dest_zone = self._get_zone_id(
                row.get("dest_lat", row["origin_lat"]),
                row.get("dest_lng", row["origin_lng"]),
            )

            # Lookup from cache
            weekday = row.get("day_of_week", datetime.utcnow().weekday())
            hour = self._extract_hour(row.get("time_of_day", "afternoon"))

            if self.traffic_cache.db:
                from src.backend.app.db.models import TrafficPattern

                pattern = self.traffic_cache.db.query(TrafficPattern).filter(
                    TrafficPattern.zone_origin == origin_zone,
                    TrafficPattern.zone_dest == dest_zone,
                    TrafficPattern.weekday == weekday,
                    TrafficPattern.hour == hour,
                ).first()

                if pattern:
                    return pattern.avg_traffic_ratio

            # Fallback to default
            return 1.0

        except Exception as e:
            logger.error(f"Error getting traffic ratio: {e}")
            return 1.0

    def _get_historical_avg_traffic(self, row: pd.Series) -> float:
        """Get historical average traffic for same hour/weekday."""
        try:
            if "origin_lat" not in row or "origin_lng" not in row:
                return 1.0

            origin_zone = self._get_zone_id(row["origin_lat"], row["origin_lng"])
            dest_zone = self._get_zone_id(
                row.get("dest_lat", row["origin_lat"]),
                row.get("dest_lng", row["origin_lng"]),
            )

            weekday = row.get("day_of_week", datetime.utcnow().weekday())
            hour = self._extract_hour(row.get("time_of_day", "afternoon"))

            if self.traffic_cache.db:
                from src.backend.app.db.models import TrafficPattern

                pattern = self.traffic_cache.db.query(TrafficPattern).filter(
                    TrafficPattern.zone_origin == origin_zone,
                    TrafficPattern.zone_dest == dest_zone,
                    TrafficPattern.weekday == weekday,
                    TrafficPattern.hour == hour,
                ).first()

                if pattern:
                    return pattern.avg_traffic_ratio

            return 1.0

        except Exception as e:
            logger.error(f"Error getting historical avg: {e}")
            return 1.0

    def _get_historical_std_traffic(self, row: pd.Series) -> float:
        """Get historical std dev of traffic for same hour/weekday."""
        try:
            if "origin_lat" not in row or "origin_lng" not in row:
                return 0.1

            origin_zone = self._get_zone_id(row["origin_lat"], row["origin_lng"])
            dest_zone = self._get_zone_id(
                row.get("dest_lat", row["origin_lat"]),
                row.get("dest_lng", row["origin_lng"]),
            )

            weekday = row.get("day_of_week", datetime.utcnow().weekday())
            hour = self._extract_hour(row.get("time_of_day", "afternoon"))

            if self.traffic_cache.db:
                from src.backend.app.db.models import TrafficPattern

                pattern = self.traffic_cache.db.query(TrafficPattern).filter(
                    TrafficPattern.zone_origin == origin_zone,
                    TrafficPattern.zone_dest == dest_zone,
                    TrafficPattern.weekday == weekday,
                    TrafficPattern.hour == hour,
                ).first()

                if pattern and pattern.std_traffic_ratio:
                    return pattern.std_traffic_ratio

            return 0.1

        except Exception as e:
            logger.error(f"Error getting historical std: {e}")
            return 0.1

    def _get_weather_severity(self, row: pd.Series) -> int:
        """
        Get weather severity level.

        Returns: 0=clear, 1=rain, 2=heavy_rain, 3=snow
        """
        # For now, return 0 (clear)
        # In production, would call weather API or use stored data
        return 0

    def _compute_effective_travel_time(self, row: pd.Series) -> float:
        """
        Compute effective travel time adjusted for traffic.

        Formula: base_time * traffic_ratio
        Base time estimate: distance_km / 30 * 60 (assuming 30 km/h average)
        """
        distance_km = row.get("distance_km", 1.0)
        traffic_ratio = row.get("current_traffic_ratio", 1.0)

        # Base travel time: 30 km/h
        base_time_min = (distance_km / 30.0) * 60.0

        effective_time = base_time_min * traffic_ratio

        return max(5.0, effective_time)  # Minimum 5 minutes

    @staticmethod
    def _extract_hour(time_of_day: Optional[str]) -> int:
        """Extract hour from time_of_day string."""
        if time_of_day == "morning":
            return 9
        elif time_of_day == "afternoon":
            return 14
        elif time_of_day == "evening":
            return 18
        elif time_of_day == "night":
            return 22
        else:
            return 12  # Default to noon

    @staticmethod
    def _get_zone_id(lat: float, lng: float) -> str:
        """Get zone ID from coordinates (1km grid)."""
        zone_lat = int(lat / 0.009) * 0.009
        zone_lng = int(lng / 0.009) * 0.009
        return f"{zone_lat:.3f}_{zone_lng:.3f}"

    def get_feature_importance_metadata(self) -> dict:
        """
        Return metadata about traffic features for model interpretation.

        Helps understand which traffic features have highest importance.
        """
        return {
            "traffic_features": [
                "current_traffic_ratio",
                "historical_avg_traffic_same_hour",
                "historical_std_traffic_same_hour",
                "is_peak_hour",
                "weather_severity",
                "effective_travel_time_min",
            ],
            "feature_descriptions": {
                "current_traffic_ratio": "Live traffic multiplier (1.0 = free flow, 2.5 = heavy)",
                "historical_avg_traffic_same_hour": "Average traffic for this zone/hour/weekday",
                "historical_std_traffic_same_hour": "Variability of traffic (high = unpredictable)",
                "is_peak_hour": "Binary: 1 if 7-10 AM or 5-8 PM on weekday",
                "weather_severity": "0=clear, 1=rain, 2=heavy_rain, 3=snow",
                "effective_travel_time_min": "Distance adjusted for traffic conditions",
            },
        }
