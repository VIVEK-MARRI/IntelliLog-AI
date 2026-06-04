"""
Realistic delivery event simulator for IntelliLog-AI.

Generates statistically honest GPS and order data that reflects real-world
delivery patterns, including:
- Multi-stop routes with realistic duration
- Speed variation by environment (highway, urban, stopped)
- Traffic and weather events
- Driver behavior variation
- Appropriate class imbalance (~20% late deliveries)
"""

import random
import uuid
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from enum import Enum
from typing import Generator, Literal, Optional
import math

import pandas as pd
import numpy as np


class EventType(str, Enum):
    """GPS event types."""
    PING = "ping"
    STOP_ARRIVAL = "stop_arrival"
    STOP_DEPARTURE = "stop_departure"
    DEPOT_ARRIVAL = "depot_arrival"


class WeatherCondition(str, Enum):
    """Weather conditions affecting delivery."""
    CLEAR = "clear"
    RAIN = "rain"
    HEAVY_RAIN = "heavy_rain"


@dataclass
class GPSEvent:
    """Single GPS ping or stop event from a driver."""
    event_id: str
    order_id: str
    driver_id: str
    tenant_id: str
    latitude: float
    longitude: float
    speed_kmh: float
    heading_degrees: float
    timestamp: datetime
    sequence_number: int
    event_type: Literal["ping", "stop_arrival", "stop_departure", "depot_arrival"]

    def to_dict(self):
        """Convert to dictionary."""
        d = asdict(self)
        d["event_type"] = self.event_type.value if isinstance(self.event_type, Enum) else self.event_type
        d["timestamp"] = d["timestamp"].isoformat()
        return d


@dataclass
class CompletedDelivery:
    """Historical record of a completed delivery."""
    order_id: str
    driver_id: str
    tenant_id: str
    planned_stops: int
    actual_stops: int
    planned_duration_minutes: float
    actual_duration_minutes: float
    was_late: bool
    delay_minutes: float
    traffic_events_encountered: int
    weather_condition: Literal["clear", "rain", "heavy_rain"]
    day_of_week: int
    hour_of_day_start: int
    avg_speed_kmh: float
    stop_dwell_time_avg_minutes: float
    driver_historical_on_time_rate: float
    distance_km: float

    def to_dict(self):
        """Convert to dictionary."""
        d = asdict(self)
        d["weather_condition"] = self.weather_condition.value if isinstance(self.weather_condition, Enum) else self.weather_condition
        return d


class DeliverySimulator:
    """
    Simulates realistic delivery routes and GPS events.
    
    Models real delivery characteristics:
    - Urban deliveries: 8-15 stops, 4-8 hours total
    - GPS noise: ±0.0001 degrees
    - Speed variation: highway (80-120 km/h), urban (20-50 km/h), stopped (0)
    - Stop duration: 2-8 minutes
    - Traffic events: 15% chance adding 5-25 min
    - Weather events: 8% chance adding 10-20% to ETAs
    - Driver behavior: 10% slow drivers (20% longer at stops)
    - Late delivery target: ~20% of deliveries
    """

    # Constants for realism
    DEPOT_LAT = 40.7128  # NYC depot
    DEPOT_LNG = -74.0060
    
    # Speed profiles (km/h)
    HIGHWAY_SPEED = (80, 120)
    URBAN_SPEED = (20, 50)
    STOPPED_SPEED = 0
    
    # Distance between stops
    MIN_STOP_DISTANCE_KM = 1.0
    MAX_STOP_DISTANCE_KM = 8.0
    
    # Stop durations (minutes)
    MIN_DWELL = 2
    MAX_DWELL = 8
    
    # GPS ping interval
    PING_INTERVAL_SECONDS = (15, 30)
    
    # Probability of events
    TRAFFIC_EVENT_PROBABILITY = 0.15  # 15% of routes
    TRAFFIC_DELAY_MINUTES = (5, 25)
    
    WEATHER_EVENT_PROBABILITY = 0.08  # 8% of routes
    WEATHER_DELAY_FACTOR = (1.10, 1.20)  # 10-20% increase
    
    SLOW_DRIVER_PROBABILITY = 0.10  # 10% of drivers
    SLOW_DRIVER_DWELL_MULTIPLIER = 1.20  # 20% longer at stops
    
    LATE_DELIVERY_TARGET_RATE = 0.20  # 20% should be late
    
    def __init__(self, tenant_id: str | None = None, seed: int | None = None):
        """
        Initialize the simulator.
        
        Args:
            tenant_id: Tenant ID for generated events. Defaults to random UUID.
            seed: Random seed for reproducibility.
        """
        self.tenant_id = tenant_id or str(uuid.uuid4())
        if seed is not None:
            random.seed(seed)
            np.random.seed(seed)
    
    def _generate_random_point_near(
        self, 
        lat: float, 
        lng: float, 
        max_distance_km: float
    ) -> tuple[float, float]:
        """
        Generate a random lat/lng point within distance from origin.
        
        Args:
            lat: Origin latitude
            lng: Origin longitude
            max_distance_km: Maximum distance in kilometers
            
        Returns:
            Tuple of (latitude, longitude)
        """
        # Earth radius in km
        R = 6371
        
        # Random distance and bearing
        distance = random.uniform(0, max_distance_km)
        bearing = random.uniform(0, 360)
        
        # Convert to radians
        lat_rad = math.radians(lat)
        lng_rad = math.radians(lng)
        bearing_rad = math.radians(bearing)
        
        # New latitude
        new_lat_rad = math.asin(
            math.sin(lat_rad) * math.cos(distance / R) +
            math.cos(lat_rad) * math.sin(distance / R) * math.cos(bearing_rad)
        )
        
        # New longitude
        new_lng_rad = lng_rad + math.atan2(
            math.sin(bearing_rad) * math.sin(distance / R) * math.cos(lat_rad),
            math.cos(distance / R) - math.sin(lat_rad) * math.sin(new_lat_rad)
        )
        
        return (math.degrees(new_lat_rad), math.degrees(new_lng_rad))
    
    def _great_circle_distance(
        self, 
        lat1: float, 
        lng1: float, 
        lat2: float, 
        lng2: float
    ) -> float:
        """
        Calculate great-circle distance between two points in km (Haversine).
        
        Args:
            lat1, lng1: First point
            lat2, lng2: Second point
            
        Returns:
            Distance in kilometers
        """
        R = 6371  # Earth radius in km
        
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        delta_lat = math.radians(lat2 - lat1)
        delta_lng = math.radians(lng2 - lng1)
        
        a = math.sin(delta_lat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lng / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        return R * c
    
    def _generate_route(self) -> tuple[list[tuple[float, float]], float]:
        """
        Generate a delivery route with multiple stops.
        
        Returns:
            Tuple of (list of (lat, lng) waypoints including depot, total_distance_km)
        """
        num_stops = random.randint(8, 15)
        waypoints = [(self.DEPOT_LAT, self.DEPOT_LNG)]
        
        total_distance = 0.0
        current_lat, current_lng = self.DEPOT_LAT, self.DEPOT_LNG
        
        for _ in range(num_stops):
            # Generate stop within max distance from current point
            next_lat, next_lng = self._generate_random_point_near(
                current_lat,
                current_lng,
                self.MAX_STOP_DISTANCE_KM
            )
            
            distance = self._great_circle_distance(current_lat, current_lng, next_lat, next_lng)
            total_distance += distance
            
            waypoints.append((next_lat, next_lng))
            current_lat, current_lng = next_lat, next_lng
        
        # Return to depot
        distance = self._great_circle_distance(current_lat, current_lng, self.DEPOT_LAT, self.DEPOT_LNG)
        total_distance += distance
        waypoints.append((self.DEPOT_LAT, self.DEPOT_LNG))
        
        return waypoints, total_distance
    
    def _calculate_segment_duration(
        self,
        distance_km: float,
        is_highway: bool = False,
        traffic_event: bool = False,
        weather_multiplier: float = 1.0
    ) -> tuple[float, int]:
        """
        Calculate time to traverse a segment with realistic variation.
        
        Args:
            distance_km: Segment distance
            is_highway: Whether this is a highway segment
            traffic_event: Whether a traffic event affects this segment
            weather_multiplier: ETA multiplier from weather
            
        Returns:
            Tuple of (duration_minutes, traffic_delay_minutes)
        """
        # Pick speed profile
        if is_highway:
            speed = random.uniform(*self.HIGHWAY_SPEED)
        else:
            speed = random.uniform(*self.URBAN_SPEED)
        
        # Base duration
        duration_minutes = (distance_km / speed) * 60
        
        # Traffic delay
        traffic_delay = 0
        if traffic_event:
            traffic_delay = random.uniform(*self.TRAFFIC_DELAY_MINUTES)
            duration_minutes += traffic_delay
        
        # Weather multiplier
        duration_minutes *= weather_multiplier
        
        return duration_minutes, traffic_delay
    
    def generate_completed_delivery(self) -> CompletedDelivery:
        """
        Generate a single completed delivery record with realistic characteristics.
        
        Returns:
            CompletedDelivery object
        """
        order_id = str(uuid.uuid4())
        driver_id = str(uuid.uuid4())
        
        # Determine if driver is slow
        is_slow_driver = random.random() < self.SLOW_DRIVER_PROBABILITY
        driver_on_time_rate = random.uniform(0.70, 0.95) if not is_slow_driver else random.uniform(0.60, 0.80)
        
        # Generate route
        waypoints, distance_km = self._generate_route()
        num_stops = len(waypoints) - 2  # Exclude depot endpoints
        
        # Determine weather
        has_weather = random.random() < self.WEATHER_EVENT_PROBABILITY
        weather = WeatherCondition.RAIN if random.random() < 0.6 else WeatherCondition.HEAVY_RAIN if has_weather else WeatherCondition.CLEAR
        weather_multiplier = random.uniform(*self.WEATHER_DELAY_FACTOR) if has_weather else 1.0
        
        # Traffic events
        has_traffic = random.random() < self.TRAFFIC_EVENT_PROBABILITY
        
        # Calculate segment durations
        total_driving_time = 0.0
        total_traffic_delay = 0.0
        
        for i in range(len(waypoints) - 1):
            lat1, lng1 = waypoints[i]
            lat2, lng2 = waypoints[i + 1]
            segment_distance = self._great_circle_distance(lat1, lng1, lat2, lng2)
            
            # Simplify: assume segments beyond first are urban
            is_highway = i == 0 and segment_distance > 5
            
            duration, traffic_delay = self._calculate_segment_duration(
                segment_distance,
                is_highway=is_highway,
                traffic_event=has_traffic,
                weather_multiplier=weather_multiplier
            )
            
            total_driving_time += duration
            total_traffic_delay += traffic_delay
        
        # Stop durations
        dwell_per_stop = random.uniform(self.MIN_DWELL, self.MAX_DWELL)
        if is_slow_driver:
            dwell_per_stop *= self.SLOW_DRIVER_DWELL_MULTIPLIER
        
        total_stop_time = dwell_per_stop * num_stops
        
        # Planned duration (slightly optimistic)
        planned_duration = total_driving_time * 0.85 + total_stop_time * 0.90
        
        # Actual duration
        actual_duration = total_driving_time + total_stop_time
        
        # Determine if late
        # Target ~20% late, but use driver on-time rate and route characteristics
        on_time_probability = driver_on_time_rate * (0.95 if not has_weather else 0.80)
        is_late = random.random() > on_time_probability
        
        # Add some randomness to actual delay
        if is_late:
            delay_minutes = random.uniform(5, 45)
        else:
            delay_minutes = -random.uniform(0, 15)  # Negative = early
        
        # Start time (random hour of day)
        start_hour = random.randint(6, 18)
        start_date = datetime.now().date() - timedelta(days=random.randint(0, 365))
        day_of_week = start_date.weekday()
        
        # Average speed
        avg_speed = distance_km / (total_driving_time / 60) if total_driving_time > 0 else 0
        
        return CompletedDelivery(
            order_id=order_id,
            driver_id=driver_id,
            tenant_id=self.tenant_id,
            planned_stops=num_stops,
            actual_stops=num_stops,  # Simplified: assume all stops completed
            planned_duration_minutes=planned_duration,
            actual_duration_minutes=actual_duration + delay_minutes,
            was_late=is_late,
            delay_minutes=delay_minutes,
            traffic_events_encountered=1 if has_traffic else 0,
            weather_condition=weather.value,
            day_of_week=day_of_week,
            hour_of_day_start=start_hour,
            avg_speed_kmh=avg_speed,
            stop_dwell_time_avg_minutes=dwell_per_stop,
            driver_historical_on_time_rate=driver_on_time_rate,
            distance_km=distance_km
        )
    
    def generate_historical(self, num_deliveries: int = 10000) -> pd.DataFrame:
        """
        Generate a dataset of completed deliveries.
        
        Args:
            num_deliveries: Number of historical deliveries to generate
            
        Returns:
            Pandas DataFrame with columns matching CompletedDelivery
        """
        deliveries = []
        
        # Generate deliveries and adjust late rate to hit target
        late_count = 0
        target_late = int(num_deliveries * self.LATE_DELIVERY_TARGET_RATE)
        
        for i in range(num_deliveries):
            delivery = self.generate_completed_delivery()
            
            # Adjust late rate toward target
            if i > num_deliveries * 0.5:  # After halfway, start adjusting
                current_late_rate = late_count / (i + 1)
                target_rate = self.LATE_DELIVERY_TARGET_RATE
                
                if current_late_rate < target_rate * 0.95 and delivery.was_late is False:
                    # Force late to catch up
                    delivery.was_late = True
                    delivery.delay_minutes = random.uniform(5, 45)
                elif current_late_rate > target_rate * 1.05 and delivery.was_late is True:
                    # Force on-time to come down
                    delivery.was_late = False
                    delivery.delay_minutes = -random.uniform(0, 15)
            
            if delivery.was_late:
                late_count += 1
            
            deliveries.append(delivery.to_dict())
        
        df = pd.DataFrame(deliveries)
        
        # Ensure no NaN values in numeric fields
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        df[numeric_cols] = df[numeric_cols].fillna(0)
        
        return df
    
    def stream_events(
        self,
        route: list[tuple[float, float]],
        start_time: datetime,
        speed_multiplier: float = 1.0,
        jitter: bool = True
    ) -> Generator[GPSEvent, None, None]:
        """
        Stream GPS events for a route in chronological order.
        
        Simulates a delivery in progress, emitting GPS pings and stop events.
        Can run in real-time (speed_multiplier=1.0) or accelerated (10x, 100x).
        
        Args:
            route: List of (lat, lng) waypoints from _generate_route()
            start_time: Start timestamp for the route
            speed_multiplier: Acceleration factor (1.0=real-time, 10.0=10x speed)
            jitter: Whether to add small GPS noise
            
        Yields:
            GPSEvent objects in sequence
        """
        order_id = str(uuid.uuid4())
        driver_id = str(uuid.uuid4())
        
        event_id_counter = 0
        sequence_number = 0
        current_time = start_time
        
        for i in range(len(route) - 1):
            # Stop arrival event
            event_id_counter += 1
            sequence_number += 1
            
            lat, lng = route[i]
            if jitter:
                lat += random.uniform(-0.0001, 0.0001)
                lng += random.uniform(-0.0001, 0.0001)
            
            yield GPSEvent(
                event_id=str(uuid.uuid4()),
                order_id=order_id,
                driver_id=driver_id,
                tenant_id=self.tenant_id,
                latitude=lat,
                longitude=lng,
                speed_kmh=0.0,
                heading_degrees=0.0,
                timestamp=current_time,
                sequence_number=sequence_number,
                event_type=EventType.STOP_ARRIVAL.value
            )
            
            # Dwell time at stop
            dwell_minutes = random.uniform(self.MIN_DWELL, self.MAX_DWELL)
            dwell_seconds = int(dwell_minutes * 60)
            current_time += timedelta(seconds=int(dwell_seconds / speed_multiplier))
            
            # Stop departure event
            event_id_counter += 1
            sequence_number += 1
            
            yield GPSEvent(
                event_id=str(uuid.uuid4()),
                order_id=order_id,
                driver_id=driver_id,
                tenant_id=self.tenant_id,
                latitude=lat,
                longitude=lng,
                speed_kmh=0.0,
                heading_degrees=0.0,
                timestamp=current_time,
                sequence_number=sequence_number,
                event_type=EventType.STOP_DEPARTURE.value
            )
            
            # Stream pings between stops
            next_lat, next_lng = route[i + 1]
            segment_distance = self._great_circle_distance(lat, lng, next_lat, next_lng)
            
            # Pick speed
            speed = random.uniform(*self.URBAN_SPEED)
            segment_duration_seconds = (segment_distance / speed) * 3600
            
            # Number of pings
            ping_interval = random.uniform(*self.PING_INTERVAL_SECONDS)
            num_pings = max(1, int(segment_duration_seconds / ping_interval))
            
            # Interpolate between stops
            for ping_idx in range(num_pings):
                progress = (ping_idx + 1) / max(num_pings, 1)
                
                interp_lat = lat + (next_lat - lat) * progress
                interp_lng = lng + (next_lng - lng) * progress
                
                if jitter:
                    interp_lat += random.uniform(-0.0001, 0.0001)
                    interp_lng += random.uniform(-0.0001, 0.0001)
                
                # Heading
                delta_lat = next_lat - lat
                delta_lng = next_lng - lng
                heading = math.degrees(math.atan2(delta_lng, delta_lat))
                if heading < 0:
                    heading += 360
                
                sequence_number += 1
                
                yield GPSEvent(
                    event_id=str(uuid.uuid4()),
                    order_id=order_id,
                    driver_id=driver_id,
                    tenant_id=self.tenant_id,
                    latitude=interp_lat,
                    longitude=interp_lng,
                    speed_kmh=speed,
                    heading_degrees=heading,
                    timestamp=current_time,
                    sequence_number=sequence_number,
                    event_type=EventType.PING.value
                )
                
                time_delta_seconds = int((segment_duration_seconds / num_pings) / speed_multiplier)
                current_time += timedelta(seconds=time_delta_seconds)
        
        # Final depot arrival
        sequence_number += 1
        
        yield GPSEvent(
            event_id=str(uuid.uuid4()),
            order_id=order_id,
            driver_id=driver_id,
            tenant_id=self.tenant_id,
            latitude=self.DEPOT_LAT,
            longitude=self.DEPOT_LNG,
            speed_kmh=0.0,
            heading_degrees=0.0,
            timestamp=current_time,
            sequence_number=sequence_number,
            event_type=EventType.DEPOT_ARRIVAL.value
        )
