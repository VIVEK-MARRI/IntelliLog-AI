"""
Feature engineering pipeline for IntelliLog-AI delay prediction model.

Ensures identical features between training (historical) and inference (live).
This consistency is critical to avoid training/serving skew.
"""

import math
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd


@dataclass
class FeatureStats:
    """Statistics for imputation during inference."""
    feature_medians: dict[str, float]
    feature_mins: dict[str, float]
    feature_maxs: dict[str, float]


class FeatureBuilder:
    """
    Build identical feature sets for training and inference.
    
    Produces 14 features that capture:
    - Order progress (stops_remaining_ratio, time_elapsed_ratio, pace_ratio)
    - Stop behavior (avg_stop_dwell_minutes)
    - GPS/speed context (current_speed, speed_ratio, route_deviation, speed_trend)
    - Driver behavior (driver_on_time_rate)
    - Temporal patterns (hour_of_day_sin/cos, is_peak_hour, day_of_week_sin/cos)
    """
    
    # Feature names in exact order (MUST match between training and inference)
    FEATURE_NAMES = [
        "stops_remaining_ratio",
        "time_elapsed_ratio",
        "pace_ratio",
        "avg_stop_dwell_minutes",
        "current_speed_kmh",
        "speed_ratio",
        "route_deviation_meters",
        "speed_trend",
        "driver_on_time_rate",
        "hour_of_day_sin",
        "hour_of_day_cos",
        "is_peak_hour",
        "day_of_week_sin",
        "day_of_week_cos",
    ]
    
    # Peak hours for delivery (7-9am, 5-8pm typical rush)
    PEAK_HOURS = {7, 8, 9, 17, 18, 19, 20}
    
    # Expected speeds for different road types (km/h)
    EXPECTED_SPEEDS = {
        "highway": 100.0,
        "urban": 35.0,
        "residential": 25.0,
    }
    
    def __init__(self, feature_stats: FeatureStats | None = None):
        """
        Initialize feature builder.
        
        Args:
            feature_stats: Statistics for imputation (from training data).
                          Required for inference, optional for training.
        """
        self.feature_stats = feature_stats
    
    def get_feature_names(self) -> list[str]:
        """Get ordered list of feature names."""
        return self.FEATURE_NAMES.copy()
    
    def build_from_historical(self, row: pd.Series) -> dict[str, float]:
        """
        Build features from a historical delivery record.
        
        Used for training on completed deliveries.
        
        Args:
            row: Pandas Series with these columns:
                - planned_stops (int)
                - planned_duration_minutes (float)
                - stop_dwell_time_avg_minutes (float)
                - avg_speed_kmh (float)
                - driver_historical_on_time_rate (float)
                - hour_of_day_start (int)
                - day_of_week (int)
                - (optional) completed_stops, actual_duration_minutes, distance_km
                
        Returns:
            Dictionary with 14 features in FEATURE_NAMES order
        """
        features = {}
        
        # ===== Order Progress Features =====
        
        # stops_remaining_ratio: 0 when all stops done, 1 at start
        planned_stops = max(int(row.get("planned_stops", 1)), 1)
        completed_stops = int(row.get("completed_stops", 0))
        stops_completed = completed_stops if completed_stops > 0 else 0
        stops_remaining_ratio = max(0.0, 1.0 - (stops_completed / planned_stops))
        features["stops_remaining_ratio"] = stops_remaining_ratio
        
        # time_elapsed_ratio: fraction of planned time used
        planned_duration = max(float(row.get("planned_duration_minutes", 1)), 1.0)
        actual_duration = float(row.get("actual_duration_minutes", planned_duration))
        time_elapsed_ratio = min(1.0, actual_duration / planned_duration)
        features["time_elapsed_ratio"] = time_elapsed_ratio
        
        # pace_ratio: if this >> 1.0, driver is behind schedule
        # pace = time_elapsed / stops_completed_ratio
        # high pace means "using too much time for progress made"
        pace_ratio = time_elapsed_ratio / max(stops_remaining_ratio, 0.01)
        features["pace_ratio"] = pace_ratio
        
        # ===== Stop Behavior =====
        
        # avg_stop_dwell_minutes: how long driver spends at each stop
        avg_dwell = float(row.get("stop_dwell_time_avg_minutes", 5.0))
        features["avg_stop_dwell_minutes"] = avg_dwell
        
        # ===== GPS/Speed Context =====
        
        # current_speed_kmh: latest observed speed
        current_speed = float(row.get("avg_speed_kmh", 35.0))
        features["current_speed_kmh"] = current_speed
        
        # speed_ratio: actual speed / expected speed
        # In historical data, use avg_speed as proxy for "current" speed
        # Assume mixed environment (average expected speed ~35 km/h)
        expected_speed = self.EXPECTED_SPEEDS["urban"]  # Default to urban
        speed_ratio = current_speed / max(expected_speed, 1.0)
        features["speed_ratio"] = speed_ratio
        
        # route_deviation_meters: for historical data, estimate from distance diff
        # This is approximate since we don't have actual GPS in historical
        # Use 0 as default (assume historical data follows planned route)
        route_deviation = float(row.get("route_deviation_meters", 0.0))
        features["route_deviation_meters"] = route_deviation
        
        # speed_trend: slope of speed over last 5 pings
        # For historical, we don't have ping-level data
        # Approximate: if actual_speed < expected_speed, trend is negative
        speed_trend = (current_speed - expected_speed) / max(expected_speed, 1.0)
        features["speed_trend"] = speed_trend
        
        # ===== Driver Context =====
        
        driver_otr = float(row.get("driver_historical_on_time_rate", 0.85))
        features["driver_on_time_rate"] = driver_otr
        
        # ===== Temporal Features (Cyclic Encoding) =====
        
        hour = int(row.get("hour_of_day_start", 12))
        hour_sin = math.sin(2 * math.pi * hour / 24.0)
        hour_cos = math.cos(2 * math.pi * hour / 24.0)
        features["hour_of_day_sin"] = hour_sin
        features["hour_of_day_cos"] = hour_cos
        
        is_peak = 1.0 if hour in self.PEAK_HOURS else 0.0
        features["is_peak_hour"] = is_peak
        
        dow = int(row.get("day_of_week", 2))
        dow_sin = math.sin(2 * math.pi * dow / 7.0)
        dow_cos = math.cos(2 * math.pi * dow / 7.0)
        features["day_of_week_sin"] = dow_sin
        features["day_of_week_cos"] = dow_cos
        
        return self._order_features(features)
    
    def build_from_live(
        self,
        order_state: dict[str, Any],
        driver_stats: dict[str, Any],
        gps_pings: list[dict[str, float]] | None = None,
    ) -> dict[str, float]:
        """
        Build features from live order state for real-time inference.
        
        Used at inference time to predict delay risk.
        
        Args:
            order_state: Dict with keys:
                - order_id (str)
                - planned_stops (int)
                - completed_stops (int)
                - planned_duration_minutes (float)
                - actual_duration_so_far_minutes (float)
                - stops_remaining (int)
                - eta_minutes_remaining (float)
                
            driver_stats: Dict with keys:
                - driver_on_time_rate (float)
                
            gps_pings: List of last 5 GPS pings (dicts with lat, lng, speed_kmh).
                      Optional; if None, uses latest state values.
        
        Returns:
            Dictionary with 14 features in FEATURE_NAMES order
        """
        features = {}
        
        # ===== Order Progress =====
        
        planned_stops = max(int(order_state.get("planned_stops", 1)), 1)
        completed_stops = int(order_state.get("completed_stops", 0))
        stops_remaining_ratio = max(0.0, 1.0 - (completed_stops / planned_stops))
        features["stops_remaining_ratio"] = stops_remaining_ratio
        
        planned_duration = max(float(order_state.get("planned_duration_minutes", 1)), 1.0)
        actual_so_far = float(order_state.get("actual_duration_so_far_minutes", 0.0))
        time_elapsed_ratio = min(1.0, actual_so_far / planned_duration)
        features["time_elapsed_ratio"] = time_elapsed_ratio
        
        pace_ratio = time_elapsed_ratio / max(stops_remaining_ratio, 0.01)
        features["pace_ratio"] = pace_ratio
        
        # ===== Stop Behavior =====
        
        # In live context, we'd need to track stop dwell times
        # For now, use a default or extract from recent stop history
        avg_dwell = float(order_state.get("avg_stop_dwell_minutes", 5.0))
        features["avg_stop_dwell_minutes"] = avg_dwell
        
        # ===== GPS/Speed Context =====
        
        current_speed = float(order_state.get("speed", 35.0))
        features["current_speed_kmh"] = current_speed
        
        expected_speed = self.EXPECTED_SPEEDS["urban"]
        speed_ratio = current_speed / max(expected_speed, 1.0)
        features["speed_ratio"] = speed_ratio
        
        route_deviation = float(order_state.get("deviation_meters", 0.0))
        features["route_deviation_meters"] = route_deviation
        
        # speed_trend: compute from last 5 pings if available
        if gps_pings and len(gps_pings) >= 2:
            speeds = [p.get("speed_kmh", 0) for p in gps_pings[-5:]]
            # Fit linear trend
            if len(speeds) >= 2:
                x = np.arange(len(speeds))
                y = np.array(speeds)
                # Simple slope: (y[-1] - y[0]) / len(y)
                trend = (speeds[-1] - speeds[0]) / max(len(speeds), 1)
            else:
                trend = 0.0
        else:
            trend = 0.0
        features["speed_trend"] = trend
        
        # ===== Driver Context =====
        
        driver_otr = float(driver_stats.get("driver_on_time_rate", 0.85))
        features["driver_on_time_rate"] = driver_otr
        
        # ===== Temporal Features =====
        
        hour = int(order_state.get("hour_of_day", 12))
        hour_sin = math.sin(2 * math.pi * hour / 24.0)
        hour_cos = math.cos(2 * math.pi * hour / 24.0)
        features["hour_of_day_sin"] = hour_sin
        features["hour_of_day_cos"] = hour_cos
        
        is_peak = 1.0 if hour in self.PEAK_HOURS else 0.0
        features["is_peak_hour"] = is_peak
        
        dow = int(order_state.get("day_of_week", 2))
        dow_sin = math.sin(2 * math.pi * dow / 7.0)
        dow_cos = math.cos(2 * math.pi * dow / 7.0)
        features["day_of_week_sin"] = dow_sin
        features["day_of_week_cos"] = dow_cos
        
        return self._order_features(features)
    
    def _order_features(self, features: dict[str, float]) -> dict[str, float]:
        """
        Ensure features are in FEATURE_NAMES order.
        
        Args:
            features: Dict with feature values
            
        Returns:
            Ordered dict with exactly FEATURE_NAMES keys
        """
        return {name: features.get(name, 0.0) for name in self.FEATURE_NAMES}
    
    def validate_features(self, features: dict[str, float]) -> bool:
        """
        Validate features for inference.
        
        Checks for:
        - No NaN values
        - No infinite values
        - Expected ranges (roughly)
        
        Args:
            features: Feature dict from build_from_* methods
            
        Returns:
            True if valid, False otherwise
            
        Raises:
            ValueError if validation fails with details
        """
        for name in self.FEATURE_NAMES:
            if name not in features:
                raise ValueError(f"Missing feature: {name}")
            
            value = features[name]
            
            # Check NaN
            if pd.isna(value):
                raise ValueError(f"Feature {name} is NaN")
            
            # Check infinite
            if np.isinf(value):
                raise ValueError(f"Feature {name} is infinite")
            
            # Check reasonable ranges (loose bounds)
            if value < -1e6 or value > 1e6:
                raise ValueError(
                    f"Feature {name} = {value} is out of reasonable range"
                )
        
        return True
    
    def compute_feature_stats(self, df: pd.DataFrame) -> FeatureStats:
        """
        Compute feature statistics from training data for imputation.
        
        Args:
            df: DataFrame with rows from build_from_historical
            
        Returns:
            FeatureStats for use in inference
        """
        # Build features for all training rows
        feature_rows = []
        for _, row in df.iterrows():
            try:
                features = self.build_from_historical(row)
                feature_rows.append(features)
            except Exception:
                continue
        
        if not feature_rows:
            raise ValueError("Could not compute features from any training rows")
        
        features_df = pd.DataFrame(feature_rows)
        
        stats = FeatureStats(
            feature_medians=features_df.median().to_dict(),
            feature_mins=features_df.min().to_dict(),
            feature_maxs=features_df.max().to_dict(),
        )
        
        return stats
    
    def impute_features(
        self,
        features: dict[str, float],
        stats: FeatureStats | None = None,
    ) -> dict[str, float]:
        """
        Impute missing features using training statistics.
        
        Args:
            features: Feature dict (may have NaNs)
            stats: FeatureStats from training (required for inference)
            
        Returns:
            Features dict with NaNs filled
        """
        if stats is None and self.feature_stats is None:
            raise ValueError("Must provide stats or initialize with feature_stats")
        
        stats = stats or self.feature_stats
        imputed = features.copy()
        
        for name in self.FEATURE_NAMES:
            if name not in imputed or pd.isna(imputed.get(name)):
                imputed[name] = stats.feature_medians.get(name, 0.0)
        
        return imputed
