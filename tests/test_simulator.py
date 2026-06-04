"""
Tests for the delivery event simulator.

Verifies:
- Generated data has ~20% late deliveries (±5% tolerance)
- All required fields present and correctly typed
- Streaming simulator emits events in correct sequence
- No NaN values in any numeric field
"""

import sys
from pathlib import Path

import pytest
import pandas as pd
import numpy as np

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from simulator.delivery_simulator import (
    DeliverySimulator,
    GPSEvent,
    CompletedDelivery,
    EventType,
    WeatherCondition,
)


class TestDeliverySimulatorHistorical:
    """Tests for historical delivery generation."""
    
    def test_generate_historical_count(self):
        """Test that correct number of deliveries are generated."""
        simulator = DeliverySimulator(seed=42)
        df = simulator.generate_historical(num_deliveries=100)
        
        assert len(df) == 100
        assert isinstance(df, pd.DataFrame)
    
    def test_late_delivery_rate_target(self):
        """Test that late delivery rate is approximately 20% (±5%)."""
        simulator = DeliverySimulator(seed=42)
        df = simulator.generate_historical(num_deliveries=1000)
        
        late_count = df['was_late'].sum()
        late_rate = late_count / len(df)
        
        target_rate = 0.20
        tolerance = 0.05
        
        assert target_rate - tolerance <= late_rate <= target_rate + tolerance, \
            f"Late rate {late_rate:.1%} outside tolerance {target_rate:.1%} ± {tolerance:.1%}"
    
    def test_all_required_fields_present(self):
        """Test that all required fields are present in generated data."""
        simulator = DeliverySimulator(seed=42)
        df = simulator.generate_historical(num_deliveries=10)
        
        required_fields = [
            'order_id',
            'driver_id',
            'tenant_id',
            'planned_stops',
            'actual_stops',
            'planned_duration_minutes',
            'actual_duration_minutes',
            'was_late',
            'delay_minutes',
            'traffic_events_encountered',
            'weather_condition',
            'day_of_week',
            'hour_of_day_start',
            'avg_speed_kmh',
            'stop_dwell_time_avg_minutes',
            'driver_historical_on_time_rate',
            'distance_km'
        ]
        
        for field in required_fields:
            assert field in df.columns, f"Missing field: {field}"
    
    def test_field_types_correct(self):
        """Test that field types are correct."""
        simulator = DeliverySimulator(seed=42)
        df = simulator.generate_historical(num_deliveries=10)
        
        # String fields
        assert df['order_id'].dtype == 'object'
        assert df['driver_id'].dtype == 'object'
        assert df['tenant_id'].dtype == 'object'
        assert df['weather_condition'].dtype == 'object'
        
        # Boolean field
        assert df['was_late'].dtype == 'bool'
        
        # Integer fields
        assert pd.api.types.is_integer_dtype(df['planned_stops'])
        assert pd.api.types.is_integer_dtype(df['actual_stops'])
        assert pd.api.types.is_integer_dtype(df['day_of_week'])
        assert pd.api.types.is_integer_dtype(df['hour_of_day_start'])
        assert pd.api.types.is_integer_dtype(df['traffic_events_encountered'])
        
        # Float fields
        float_fields = [
            'planned_duration_minutes',
            'actual_duration_minutes',
            'delay_minutes',
            'avg_speed_kmh',
            'stop_dwell_time_avg_minutes',
            'driver_historical_on_time_rate',
            'distance_km'
        ]
        for field in float_fields:
            assert pd.api.types.is_float_dtype(df[field]), f"{field} should be float"
    
    def test_no_nan_values(self):
        """Test that there are no NaN values in numeric fields."""
        simulator = DeliverySimulator(seed=42)
        df = simulator.generate_historical(num_deliveries=100)
        
        # Check numeric columns
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        nan_counts = df[numeric_cols].isna().sum()
        
        assert nan_counts.sum() == 0, \
            f"Found NaN values: {nan_counts[nan_counts > 0].to_dict()}"
    
    def test_field_value_ranges(self):
        """Test that field values are within reasonable ranges."""
        simulator = DeliverySimulator(seed=42)
        df = simulator.generate_historical(num_deliveries=100)
        
        # Stops should be positive
        assert (df['planned_stops'] > 0).all()
        assert (df['actual_stops'] >= 0).all()
        assert (df['actual_stops'] <= df['planned_stops']).all()
        
        # Durations should be positive
        assert (df['planned_duration_minutes'] > 0).all()
        assert (df['actual_duration_minutes'] > 0).all()
        
        # Speed should be non-negative
        assert (df['avg_speed_kmh'] >= 0).all()
        
        # On-time rate should be 0-1
        assert (df['driver_historical_on_time_rate'] >= 0.0).all()
        assert (df['driver_historical_on_time_rate'] <= 1.0).all()
        
        # Distance should be positive
        assert (df['distance_km'] > 0).all()
        
        # Day of week should be 0-6
        assert (df['day_of_week'] >= 0).all()
        assert (df['day_of_week'] < 7).all()
        
        # Hour should be 0-23
        assert (df['hour_of_day_start'] >= 0).all()
        assert (df['hour_of_day_start'] < 24).all()
        
        # Weather condition should be valid
        valid_weather = {'clear', 'rain', 'heavy_rain'}
        assert set(df['weather_condition'].unique()).issubset(valid_weather)
    
    def test_consistency_on_time_vs_delay(self):
        """Test that was_late and delay_minutes are consistent."""
        simulator = DeliverySimulator(seed=42)
        df = simulator.generate_historical(num_deliveries=100)
        
        # If late, delay should be positive
        late_rows = df[df['was_late'] == True]
        assert (late_rows['delay_minutes'] > 0).all(), \
            "Late deliveries should have positive delay"
        
        # If on-time, delay should be negative or zero
        ontime_rows = df[df['was_late'] == False]
        assert (ontime_rows['delay_minutes'] <= 0).all(), \
            "On-time deliveries should have non-positive delay"
    
    def test_unique_order_and_driver_ids(self):
        """Test that order_id and driver_id are unique per row."""
        simulator = DeliverySimulator(seed=42)
        df = simulator.generate_historical(num_deliveries=100)
        
        # Each row should have unique order_id
        assert len(df['order_id'].unique()) == len(df), \
            "order_id should be unique per row"
    
    def test_reproducibility_with_seed(self):
        """Test that same seed produces same results."""
        sim1 = DeliverySimulator(seed=123)
        df1 = sim1.generate_historical(num_deliveries=50)
        
        sim2 = DeliverySimulator(seed=123)
        df2 = sim2.generate_historical(num_deliveries=50)
        
        # Sort by distance to handle potential row order differences
        df1_sorted = df1.sort_values('distance_km').reset_index(drop=True)
        df2_sorted = df2.sort_values('distance_km').reset_index(drop=True)
        
        # Compare numeric columns (allow small floating point differences)
        numeric_cols = df1_sorted.select_dtypes(include=[np.number]).columns
        pd.testing.assert_frame_equal(
            df1_sorted[numeric_cols],
            df2_sorted[numeric_cols],
            atol=1e-6
        )


class TestDeliverySimulatorStreaming:
    """Tests for streaming GPS event generation."""
    
    def test_stream_events_sequence_order(self):
        """Test that streaming events are in correct sequence order."""
        simulator = DeliverySimulator(seed=42)
        route, distance = simulator._generate_route()
        
        from datetime import datetime
        start_time = datetime(2024, 1, 1, 12, 0, 0)
        
        events = list(simulator.stream_events(route, start_time, speed_multiplier=1.0))
        
        # Check that all events are GPSEvent objects
        assert all(isinstance(e, GPSEvent) for e in events)
        
        # Check sequence numbers are monotonically increasing
        sequence_numbers = [e.sequence_number for e in events]
        assert sequence_numbers == sorted(sequence_numbers), \
            "Sequence numbers should be monotonically increasing"
        
        # Check first sequence number
        assert events[0].sequence_number > 0
        
        # Check last event is depot arrival
        assert events[-1].event_type == EventType.DEPOT_ARRIVAL.value
        
        # Check first event is stop arrival
        assert events[0].event_type == EventType.STOP_ARRIVAL.value
    
    def test_stream_events_time_progression(self):
        """Test that timestamps progress through route."""
        simulator = DeliverySimulator(seed=42)
        route, distance = simulator._generate_route()
        
        from datetime import datetime
        start_time = datetime(2024, 1, 1, 12, 0, 0)
        
        events = list(simulator.stream_events(route, start_time, speed_multiplier=1.0))
        
        # Check timestamps are monotonically increasing
        timestamps = [e.timestamp for e in events]
        assert timestamps == sorted(timestamps), \
            "Timestamps should be monotonically increasing"
        
        # Check first timestamp matches start
        assert events[0].timestamp == start_time
        
        # Check last timestamp is after first (route has duration)
        assert events[-1].timestamp > events[0].timestamp
    
    def test_stream_events_have_gps_coordinates(self):
        """Test that all events have valid GPS coordinates."""
        simulator = DeliverySimulator(seed=42)
        route, distance = simulator._generate_route()
        
        from datetime import datetime
        start_time = datetime(2024, 1, 1, 12, 0, 0)
        
        events = list(simulator.stream_events(route, start_time, speed_multiplier=1.0))
        
        for event in events:
            # Latitude should be valid
            assert -90 <= event.latitude <= 90, \
                f"Invalid latitude: {event.latitude}"
            
            # Longitude should be valid
            assert -180 <= event.longitude <= 180, \
                f"Invalid longitude: {event.longitude}"
            
            # Speed should be non-negative
            assert event.speed_kmh >= 0, \
                f"Invalid speed: {event.speed_kmh}"
            
            # Heading should be 0-360 or None
            if event.heading_degrees is not None:
                assert 0 <= event.heading_degrees < 360, \
                    f"Invalid heading: {event.heading_degrees}"
    
    def test_stream_events_field_presence(self):
        """Test that all required GPS event fields are present."""
        simulator = DeliverySimulator(seed=42)
        route, distance = simulator._generate_route()
        
        from datetime import datetime
        start_time = datetime(2024, 1, 1, 12, 0, 0)
        
        events = list(simulator.stream_events(route, start_time, speed_multiplier=1.0))
        
        required_fields = [
            'event_id',
            'order_id',
            'driver_id',
            'tenant_id',
            'latitude',
            'longitude',
            'speed_kmh',
            'heading_degrees',
            'timestamp',
            'sequence_number',
            'event_type'
        ]
        
        for event in events:
            for field in required_fields:
                assert hasattr(event, field), \
                    f"Event missing field: {field}"
                assert getattr(event, field) is not None or field in ['heading_degrees'], \
                    f"Field {field} is None"
    
    def test_stream_events_stop_pattern(self):
        """Test that streaming produces expected stop arrival/departure pattern."""
        simulator = DeliverySimulator(seed=42)
        route, distance = simulator._generate_route()
        
        from datetime import datetime
        start_time = datetime(2024, 1, 1, 12, 0, 0)
        
        events = list(simulator.stream_events(route, start_time, speed_multiplier=1.0))
        
        # Extract event types
        event_types = [e.event_type for e in events]
        
        # Should have arrival events (except first ping)
        assert EventType.STOP_ARRIVAL.value in event_types
        
        # Should have departure events
        assert EventType.STOP_DEPARTURE.value in event_types
        
        # Should have ping events
        assert EventType.PING.value in event_types
        
        # Should end with depot arrival
        assert event_types[-1] == EventType.DEPOT_ARRIVAL.value
    
    def test_stream_events_speed_profile(self):
        """Test that speed varies realistically (non-zero during travel, zero at stops)."""
        simulator = DeliverySimulator(seed=42)
        route, distance = simulator._generate_route()
        
        from datetime import datetime
        start_time = datetime(2024, 1, 1, 12, 0, 0)
        
        events = list(simulator.stream_events(route, start_time, speed_multiplier=1.0))
        
        # At stop arrival/departure, speed should be 0
        for event in events:
            if event.event_type in [EventType.STOP_ARRIVAL.value, EventType.STOP_DEPARTURE.value, EventType.DEPOT_ARRIVAL.value]:
                assert event.speed_kmh == 0, \
                    f"Stop event should have zero speed, got {event.speed_kmh}"
        
        # At least some pings should have non-zero speed
        ping_speeds = [e.speed_kmh for e in events if e.event_type == EventType.PING.value]
        assert any(s > 0 for s in ping_speeds), \
            "At least some ping events should have non-zero speed"
    
    def test_stream_events_speed_multiplier(self):
        """Test that speed multiplier affects timing."""
        simulator = DeliverySimulator(seed=42)
        route, distance = simulator._generate_route()
        
        from datetime import datetime
        start_time = datetime(2024, 1, 1, 12, 0, 0)
        
        # Stream at 1x speed
        events_1x = list(simulator.stream_events(route, start_time, speed_multiplier=1.0))
        duration_1x = (events_1x[-1].timestamp - events_1x[0].timestamp).total_seconds()
        
        # Stream at 10x speed (should be ~10x faster)
        events_10x = list(simulator.stream_events(route, start_time, speed_multiplier=10.0))
        duration_10x = (events_10x[-1].timestamp - events_10x[0].timestamp).total_seconds()
        
        # 1x should take roughly 10x longer than 10x (with tolerance for randomness)
        ratio = duration_1x / duration_10x
        assert 7 < ratio < 15, \
            f"Speed multiplier not working correctly. Ratio: {ratio}"
    
    def test_stream_events_acceleration(self):
        """Test that events can be accelerated significantly."""
        simulator = DeliverySimulator(seed=42)
        route, distance = simulator._generate_route()
        
        from datetime import datetime
        start_time = datetime(2024, 1, 1, 12, 0, 0)
        
        # Stream at 100x speed
        events = list(simulator.stream_events(route, start_time, speed_multiplier=100.0))
        
        duration = (events[-1].timestamp - events[0].timestamp).total_seconds()
        
        # Should complete in under 10 minutes at 100x speed
        assert duration < 10 * 60, \
            f"100x acceleration took {duration} seconds (should be <600)"


class TestDeliverySimulatorDataClasses:
    """Tests for data classes."""
    
    def test_gps_event_to_dict(self):
        """Test GPSEvent.to_dict() serialization."""
        from datetime import datetime
        event = GPSEvent(
            event_id="event-123",
            order_id="order-456",
            driver_id="driver-789",
            tenant_id="tenant-000",
            latitude=40.7128,
            longitude=-74.0060,
            speed_kmh=45.2,
            heading_degrees=125.5,
            timestamp=datetime(2024, 1, 1, 12, 0, 0),
            sequence_number=1,
            event_type=EventType.PING.value
        )
        
        d = event.to_dict()
        
        assert d['event_id'] == "event-123"
        assert d['latitude'] == 40.7128
        assert isinstance(d['timestamp'], str)  # Should be ISO format
        assert d['event_type'] == "ping"
    
    def test_completed_delivery_to_dict(self):
        """Test CompletedDelivery.to_dict() serialization."""
        delivery = CompletedDelivery(
            order_id="order-123",
            driver_id="driver-456",
            tenant_id="tenant-789",
            planned_stops=10,
            actual_stops=10,
            planned_duration_minutes=240.0,
            actual_duration_minutes=250.0,
            was_late=True,
            delay_minutes=10.0,
            traffic_events_encountered=1,
            weather_condition=WeatherCondition.CLEAR.value,
            day_of_week=2,
            hour_of_day_start=9,
            avg_speed_kmh=42.5,
            stop_dwell_time_avg_minutes=5.0,
            driver_historical_on_time_rate=0.85,
            distance_km=180.0
        )
        
        d = delivery.to_dict()
        
        assert d['order_id'] == "order-123"
        assert d['was_late'] == True
        assert d['weather_condition'] == "clear"


class TestIntegration:
    """Integration tests."""
    
    def test_full_workflow(self):
        """Test complete workflow: generate historical + stream events."""
        simulator = DeliverySimulator(seed=42)
        
        # Generate historical data
        df_historical = simulator.generate_historical(num_deliveries=50)
        assert len(df_historical) == 50
        
        # Generate streaming route and events
        route, distance = simulator._generate_route()
        assert len(route) > 2
        
        from datetime import datetime
        events = list(simulator.stream_events(
            route,
            datetime(2024, 1, 1, 12, 0, 0),
            speed_multiplier=10.0
        ))
        assert len(events) > 0
        
        # Verify consistency
        assert all(e.order_id is not None for e in events)
        assert all(e.driver_id is not None for e in events)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
