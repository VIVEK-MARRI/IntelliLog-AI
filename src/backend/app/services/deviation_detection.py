"""Route deviation detection using geometric algorithms."""

import logging
import math
from typing import List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


def haversine_distance_m(
    lat1: float, lon1: float, lat2: float, lon2: float
) -> float:
    """Calculate haversine distance between two points in meters."""
    R = 6371000  # Earth radius in meters
    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)

    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


def point_to_linestring_distance(
    point: Tuple[float, float], linestring: List[Tuple[float, float]]
) -> Tuple[float, int]:
    """
    Calculate perpendicular distance from point to nearest segment in linestring.
    
    Returns:
        (distance_m, nearest_segment_index)
    """
    point_lat, point_lon = point
    min_distance = float("inf")
    nearest_segment = 0

    for i in range(len(linestring) - 1):
        lat1, lon1 = linestring[i]
        lat2, lon2 = linestring[i + 1]

        # Distance from point to line segment using cross product method
        distance = point_to_segment_distance(
            point_lat, point_lon, lat1, lon1, lat2, lon2
        )

        if distance < min_distance:
            min_distance = distance
            nearest_segment = i

    return min_distance, nearest_segment


def point_to_segment_distance(
    p_lat: float, p_lon: float, a_lat: float, a_lon: float, b_lat: float, b_lon: float
) -> float:
    """
    Calculate perpendicular distance from point P to line segment AB.
    Uses Mercator projection approximation for local accuracy.
    """
    # Convert to approximate meters using Mercator projection
    lat_avg_rad = math.radians((p_lat + a_lat + b_lat) / 3)
    
    # Scale factor for longitude at this latitude
    x_scale = math.cos(lat_avg_rad) * 111320  # meters per degree
    y_scale = 111320  # meters per degree latitude
    
    # Convert to relative coordinates (meters from origin)
    px = (p_lon - a_lon) * x_scale
    py = (p_lat - a_lat) * y_scale
    ax = 0
    ay = 0
    bx = (b_lon - a_lon) * x_scale
    by = (b_lat - a_lat) * y_scale

    # Vector AB
    ab_len_sq = bx * bx + by * by
    
    if ab_len_sq == 0:
        # Segment is a point, return distance to that point
        return math.sqrt(px * px + py * py)

    # Parameter t of closest point on segment
    t = max(0, min(1, (px * bx + py * by) / ab_len_sq))

    # Closest point on segment
    closest_x = ax + t * bx
    closest_y = ay + t * by

    # Distance
    distance = math.sqrt((px - closest_x) ** 2 + (py - closest_y) ** 2)
    return distance


class DeviationDetector:
    """Detects when a driver deviates from their planned route."""

    def __init__(
        self,
        deviation_threshold_m: float = 400.0,
        recovery_threshold_m: float = 200.0,
        consecutive_threshold: int = 3,
    ):
        """
        Initialize detector.
        
        Args:
            deviation_threshold_m: Distance in meters to trigger deviation detection
            recovery_threshold_m: Distance in meters to clear deviation
            consecutive_threshold: Number of consecutive off-route readings to trigger flag
        """
        self.deviation_threshold_m = deviation_threshold_m
        self.recovery_threshold_m = recovery_threshold_m
        self.consecutive_threshold = consecutive_threshold

    def check_deviation(
        self,
        current_position: Tuple[float, float],
        route_geometry: List[Tuple[float, float]],
        consecutive_count: int = 0,
    ) -> Tuple[bool, float, int]:
        """
        Check if driver is deviating from route.
        
        Args:
            current_position: (latitude, longitude) of driver
            route_geometry: List of (latitude, longitude) route waypoints
            consecutive_count: Current consecutive deviation count
            
        Returns:
            (is_deviated, perpendicular_distance_m, new_consecutive_count)
        """
        if not route_geometry or len(route_geometry) < 2:
            logger.warning("Invalid route geometry for deviation check")
            return False, 0.0, 0

        try:
            distance, _ = point_to_linestring_distance(current_position, route_geometry)

            if distance > self.deviation_threshold_m:
                new_consecutive = consecutive_count + 1
                is_deviated = new_consecutive >= self.consecutive_threshold
                
                logger.debug(
                    f"Driver position {distance:.1f}m from route. "
                    f"Consecutive count: {new_consecutive}"
                )
                
                return is_deviated, distance, new_consecutive
            else:
                # Driver is back on route
                return False, distance, 0

        except Exception as e:
            logger.error(f"Error checking deviation: {e}")
            return False, 0.0, consecutive_count

    def estimate_deviation_duration_minutes(
        self, position_history: List[Tuple[float, float, float]], speed_kmh: float = 25.0
    ) -> float:
        """
        Estimate how long driver has been deviating based on position history.
        
        Args:
            position_history: List of (lat, lon, timestamp_epoch) positions
            speed_kmh: Expected speed for ETA
            
        Returns:
            Estimated deviation duration in minutes
        """
        if len(position_history) < 2:
            return 0.0

        first_pos = position_history[0]
        last_pos = position_history[-1]

        time_diff = last_pos[2] - first_pos[2]  # seconds
        if time_diff <= 0:
            return 0.0

        distance_m = haversine_distance_m(first_pos[0], first_pos[1], last_pos[0], last_pos[1])
        
        # Expected distance at current speed
        expected_distance_m = (speed_kmh / 3.6) * time_diff
        
        # Additional distance due to deviation
        extra_distance_m = max(0, distance_m - expected_distance_m)
        
        deviation_minutes = (extra_distance_m / 1000) / (speed_kmh / 60) if speed_kmh > 0 else 0
        return max(0, deviation_minutes)


def create_deviation_detector(**kwargs) -> DeviationDetector:
    """Factory function to create deviation detector."""
    return DeviationDetector(**kwargs)
