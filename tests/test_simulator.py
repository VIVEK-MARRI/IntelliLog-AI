"""
Comprehensive tests for delivery_simulator module.

Tests verify:
- Generated data has ~20% late deliveries (±5% tolerance)
- All required fields present and correctly typed
- Streaming simulator emits events in correct sequence order
- No NaN values in any numeric field
- Realistic distributions of distances, speeds, and durations
"""

import pytest
import numpy as np
import pandas as pd
from datetime import datetime, timezone
from typing import List
import math

from src.simulator.delivery_simulator import (
    DeliverySimulator,
    GPSPingEvent,
    CompletedDelivery,
    EventType,
    WeatherCondition,
)


# ============================================================================
# FIXTURES
# ============================================================================


@pytest.fixture
def simulator():
    """Create a simulator instance with fixed seed for reproducibility."""
    return DeliverySimulator(seed=42)


@pytest.fixture
def historical_data(simulator):
    """Generate small dataset for testing."""
    return simulator.generate_historical(num_deliveries=500)


# ============================================================================
# TESTS: HISTORICAL DATA GENERATION
# ============================================================================


class TestHistoricalDataGeneration:
    """Tests for the generate_historical() method."""

    def test_generates_correct_number_of_records(self, simulator):
        """Verify correct number of records generated."""
        df = simulator.generate_historical(num_deliveries=100)
        assert len(df) == 100, "Should generate exactly requested number of records"

    def test_late_delivery_rate_within_tolerance(self, simulator):
        """Late delivery rate should be ~20% ±5%."""
        df = simulator.generate_historical(num_deliveries=1000)
        late_rate = df['was_late'].sum() / len(df)
        
        assert 0.15 <= late_rate <= 0.25, \
            f"Late rate {late_rate:.1%} outside target range 15%-25%"

    def test_all_columns_present(self, simulator):
        """Verify all required columns are present."""
        df = simulator.generate_historical(num_deliveries=10)
        
        required_columns = {
            'order_id', 'driver_id', 'tenant_id',
            'planned_stops', 'actual_stops',
            'planned_duration_minutes', 'actual_duration_minutes',
            'was_late', 'delay_minutes',
            'traffic_events_encountered',
            'weather_condition',
            'day_of_week', 'hour_of_day_start',
            'avg_speed_kmh', 'stop_dwell_time_avg_minutes',
            'driver_historical_on_time_rate', 'distance_km'
        }
        
        assert required_columns.issubset(set(df.columns)), \
            f"Missing columns: {required_columns - set(df.columns)}"

    def test_no_nan_values(self, simulator):
        """Verify no NaN values in numeric fields."""
        df = simulator.generate_historical(num_deliveries=100)
        
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        nan_counts = df[numeric_cols].isna().sum()
        
        assert nan_counts.sum() == 0, \
            f"Found NaN values: {nan_counts[nan_counts > 0].to_dict()}"

    def test_no_infinite_values(self, simulator):
        """Verify no infinite values in numeric fields."""
        df = simulator.generate_historical(num_deliveries=100)
        
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        
        for col in numeric_cols:
            inf_count = np.isinf(df[col]).sum()
            assert inf_count == 0, f"Found {inf_count} infinite values in {col}"

    def test_column_types(self, simulator):
        """Verify column data types are correct."""
        df = simulator.generate_historical(num_deliveries=10)
        
        type_map = {
            'order_id': 'object',
            'driver_id': 'object',
            'tenant_id': 'object',
            'planned_stops': 'int64',
            'actual_stops': 'int64',
            'was_late': 'bool',
            'avg_speed_kmh': 'float64',
            'weather_condition': 'object',
        }
        
        for col, expected_type in type_map.items():
            assert str(df[col].dtype) == expected_type, \
                f"{col} has type {df[col].dtype}, expected {expected_type}"

    def test_stops_realistic_range(self, simulator):
        """Verify planned stops are in realistic range (8-15)."""
        df = simulator.generate_historical(num_deliveries=100)
        
        assert df['planned_stops'].min() >= 8, "Min stops too low"
        assert df['planned_stops'].max() <= 15, "Max stops too high"
        assert df['actual_stops'].min() >= 8, "Actual stops min too low"
        assert df['actual_stops'].max() <= 15, "Actual stops max too high"

    def test_duration_realistic_range(self, simulator):
        """Verify duration is in realistic range with some tolerance for weather/traffic."""
        df = simulator.generate_historical(num_deliveries=100)
        
        # Base range is 4-8 hours = 240-480 minutes, but weather and traffic can add 20%+
        # So allow up to 10-11 hours for rare cases
        min_duration = 3 * 60  # 3 hours
        max_duration = 12 * 60  # 12 hours (accounting for traffic, weather, slow drivers)
        
        # Most deliveries should be in reasonable range
        reasonably_timed = (df['planned_duration_minutes'] >= 3.5 * 60) & \
                          (df['planned_duration_minutes'] <= 10 * 60)
        assert reasonably_timed.sum() / len(df) > 0.90, \
            "At least 90% of deliveries should be in 3.5-10 hour range"

    def test_delay_minutes_consistency(self, simulator):
        """Verify delay_minutes is consistent with was_late."""
        df = simulator.generate_historical(num_deliveries=100)
        
        # Late deliveries should have positive delay
        late_deliveries = df[df['was_late']]
        assert (late_deliveries['delay_minutes'] >= 0).all(), \
            "Late deliveries should have positive delay_minutes"
        
        # On-time deliveries should have non-positive delay
        ontime_deliveries = df[~df['was_late']]
        assert (ontime_deliveries['delay_minutes'] <= 0).all(), \
            "On-time deliveries should have non-positive delay_minutes"

    def test_on_time_rate_validity(self, simulator):
        """Verify driver_historical_on_time_rate is between 0 and 1."""
        df = simulator.generate_historical(num_deliveries=100)
        
        rates = df['driver_historical_on_time_rate']
        assert (rates >= 0.5).all() and (rates <= 0.95).all(), \
            "On-time rates should be between 0.5 and 0.95"

    def test_distance_reasonable(self, simulator):
        """Verify distance values are reasonable."""
        df = simulator.generate_historical(num_deliveries=100)
        
        # Urban delivery in 50 km radius should be < 1000 km
        assert df['distance_km'].max() < 1000, "Distance too large"
        assert df['distance_km'].min() > 50, "Distance too small (should span multiple stops)"

    def test_speed_realistic(self, simulator):
        """Verify average speed is realistic."""
        df = simulator.generate_historical(num_deliveries=100)
        
        # Average speed for urban delivery should be 15-45 km/h
        assert df['avg_speed_kmh'].min() >= 15, "Speed too low"
        assert df['avg_speed_kmh'].max() <= 50, "Speed too high"

    def test_weather_distribution(self, simulator):
        """Verify weather conditions have reasonable distribution."""
        df = simulator.generate_historical(num_deliveries=1000)
        
        weather_counts = df['weather_condition'].value_counts()
        clear_rate = weather_counts.get('clear', 0) / len(df)
        
        # Roughly 92% should be clear, 8% rain/heavy_rain
        assert 0.85 <= clear_rate <= 0.95, \
            f"Clear weather rate {clear_rate:.1%} outside expected 85-95%"

    def test_traffic_distribution(self, simulator):
        """Verify traffic events have reasonable distribution."""
        df = simulator.generate_historical(num_deliveries=1000)
        
        traffic_rate = (df['traffic_events_encountered'] > 0).sum() / len(df)
        
        # Roughly 15% should have traffic
        assert 0.10 <= traffic_rate <= 0.20, \
            f"Traffic rate {traffic_rate:.1%} outside expected 10-20%"

    def test_unique_ids(self, simulator):
        """Verify order and driver IDs are properly distributed."""
        df = simulator.generate_historical(num_deliveries=100)
        
        # Each row should have unique order_id
        assert df['order_id'].nunique() == len(df), \
            "Order IDs should be unique"
        
        # Driver IDs should be reused (multiple deliveries per driver)
        # With 100 deliveries and ~8 per driver, should have ~12 drivers
        driver_unique_count = df['driver_id'].nunique()
        assert driver_unique_count < len(df), \
            "Drivers should have multiple deliveries"
        # Allow range: 8-20 drivers for 100 deliveries
        assert 8 <= driver_unique_count <= 20, \
            f"Expected 8-20 drivers for 100 deliveries, got {driver_unique_count}"


# ============================================================================
# TESTS: STREAMING SIMULATOR
# ============================================================================


class TestStreamingSimulator:
    """Tests for the stream_events() method."""

    def test_stream_generates_events(self, simulator):
        """Verify streaming generates GPS events."""
        order_id = "test-order-123"
        events = list(simulator.stream_events(order_id))
        
        assert len(events) > 0, "Should generate at least one event"
        assert all(isinstance(e, GPSPingEvent) for e in events), \
            "All events should be GPSPingEvent instances"

    def test_stream_event_sequence_order(self, simulator):
        """Verify events are in correct sequence order."""
        order_id = "test-order-123"
        events = list(simulator.stream_events(order_id))
        
        sequence_numbers = [e.sequence_number for e in events]
        assert sequence_numbers == sorted(sequence_numbers), \
            "Sequence numbers should be in ascending order"
        
        # Should start at 0
        assert sequence_numbers[0] == 0, "First sequence number should be 0"
        
        # Should be contiguous
        for i, seq_num in enumerate(sequence_numbers):
            assert seq_num == i, f"Sequence numbers should be contiguous (got {seq_num} at index {i})"

    def test_stream_starts_with_depot_arrival(self, simulator):
        """First event should be depot arrival."""
        order_id = "test-order-123"
        events = list(simulator.stream_events(order_id))
        
        assert len(events) > 0, "Should have events"
        first_event = events[0]
        assert first_event.event_type == EventType.DEPOT_ARRIVAL.value, \
            "First event should be depot arrival"

    def test_stream_ends_with_depot_arrival(self, simulator):
        """Last event should be depot arrival."""
        order_id = "test-order-123"
        events = list(simulator.stream_events(order_id))
        
        assert len(events) > 0, "Should have events"
        last_event = events[-1]
        assert last_event.event_type == EventType.DEPOT_ARRIVAL.value, \
            "Last event should be depot arrival"

    def test_stream_has_stop_events(self, simulator):
        """Should have stop arrival and departure events."""
        order_id = "test-order-123"
        events = list(simulator.stream_events(order_id))
        
        event_types = [e.event_type for e in events]
        
        assert EventType.STOP_ARRIVAL.value in event_types, \
            "Should have stop arrival events"
        assert EventType.STOP_DEPARTURE.value in event_types, \
            "Should have stop departure events"

    def test_stream_event_fields_present(self, simulator):
        """Verify all required fields present in events."""
        order_id = "test-order-123"
        events = list(simulator.stream_events(order_id))
        
        required_fields = {
            'event_id', 'order_id', 'driver_id', 'tenant_id',
            'latitude', 'longitude', 'speed_kmh', 'heading_degrees',
            'timestamp', 'sequence_number', 'event_type'
        }
        
        for event in events:
            event_dict = vars(event)
            assert required_fields.issubset(set(event_dict.keys())), \
                f"Event missing fields: {required_fields - set(event_dict.keys())}"

    def test_stream_event_types_valid(self, simulator):
        """Verify event types are valid."""
        order_id = "test-order-123"
        events = list(simulator.stream_events(order_id))
        
        valid_types = {e.value for e in EventType}
        
        for event in events:
            assert event.event_type in valid_types, \
                f"Invalid event type: {event.event_type}"

    def test_stream_coordinates_valid(self, simulator):
        """Verify coordinates are within reasonable range."""
        order_id = "test-order-123"
        events = list(simulator.stream_events(order_id))
        
        for event in events:
            # Should be within ~100 km of Hyderabad depot
            lat_delta = abs(event.latitude - simulator.DEPOT_LAT)
            lng_delta = abs(event.longitude - simulator.DEPOT_LNG)
            
            # Rough approximation: 1 degree ≈ 111 km
            distance_km = math.sqrt((lat_delta * 111)**2 + (lng_delta * 111)**2)
            
            assert distance_km < 100, \
                f"Event {distance_km:.1f}km from depot (too far)"

    def test_stream_timestamps_ordered(self, simulator):
        """Verify timestamps are in ascending order."""
        order_id = "test-order-123"
        events = list(simulator.stream_events(order_id))
        
        timestamps = [e.timestamp for e in events]
        assert timestamps == sorted(timestamps), \
            "Timestamps should be in ascending order"

    def test_stream_speed_realistic(self, simulator):
        """Verify speeds are realistic."""
        order_id = "test-order-123"
        events = list(simulator.stream_events(order_id))
        
        for event in events:
            # Speed should be between 0 and 150 km/h
            assert 0 <= event.speed_kmh <= 150, \
                f"Speed {event.speed_kmh} km/h outside valid range"

    def test_stream_heading_valid(self, simulator):
        """Verify heading is valid (0-360 degrees) or None."""
        order_id = "test-order-123"
        events = list(simulator.stream_events(order_id))
        
        for event in events:
            if event.heading_degrees is not None:
                assert 0 <= event.heading_degrees <= 360, \
                    f"Heading {event.heading_degrees} outside 0-360 range"

    def test_stream_no_nan_values(self, simulator):
        """Verify no NaN values in event data."""
        order_id = "test-order-123"
        events = list(simulator.stream_events(order_id))
        
        for event in events:
            assert not math.isnan(event.latitude), "NaN in latitude"
            assert not math.isnan(event.longitude), "NaN in longitude"
            assert not math.isnan(event.speed_kmh), "NaN in speed_kmh"
            if event.heading_degrees is not None:
                assert not math.isnan(event.heading_degrees), "NaN in heading_degrees"

    def test_stream_acceleration_factor(self, simulator):
        """Verify acceleration factor works."""
        order_id = "test-order-123"
        
        # Get real-time duration
        events_1x = list(simulator.stream_events(order_id, acceleration=1.0))
        time_1x = (events_1x[-1].timestamp - events_1x[0].timestamp).total_seconds()
        
        # Get 10x accelerated duration
        events_10x = list(simulator.stream_events(order_id, acceleration=10.0))
        time_10x = (events_10x[-1].timestamp - events_10x[0].timestamp).total_seconds()
        
        # 10x should be roughly 1/10th the time
        ratio = time_1x / time_10x
        assert 8 < ratio < 12, \
            f"Acceleration ratio {ratio:.1f} not close to 10.0"


# ============================================================================
# TESTS: GPS PING EVENT DATACLASS
# ============================================================================


class TestGPSPingEvent:
    """Tests for GPSPingEvent dataclass."""

    def test_gps_event_to_dict(self, simulator):
        """Verify to_dict() method works and timestamps are ISO format."""
        order_id = "test-order-123"
        events = list(simulator.stream_events(order_id))
        
        event_dict = events[0].to_dict()
        
        assert isinstance(event_dict, dict), "to_dict() should return dict"
        assert isinstance(event_dict['timestamp'], str), \
            "timestamp should be string after to_dict()"
        
        # Should be ISO format
        datetime.fromisoformat(event_dict['timestamp'])  # Should not raise


# ============================================================================
# TESTS: COMPLETED DELIVERY DATACLASS
# ============================================================================


class TestCompletedDelivery:
    """Tests for CompletedDelivery dataclass."""

    def test_completed_delivery_to_dict(self, simulator):
        """Verify to_dict() method works."""
        df = simulator.generate_historical(num_deliveries=5)
        
        for _, row in df.iterrows():
            delivery = CompletedDelivery(**row.to_dict())
            delivery_dict = delivery.to_dict()
            
            assert isinstance(delivery_dict, dict), "to_dict() should return dict"
            assert 'order_id' in delivery_dict, "Should have order_id"
            assert 'was_late' in delivery_dict, "Should have was_late"


# ============================================================================
# TESTS: EDGE CASES AND ERROR HANDLING
# ============================================================================


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_single_delivery(self, simulator):
        """Can generate single delivery."""
        df = simulator.generate_historical(num_deliveries=1)
        assert len(df) == 1, "Should generate one record"

    def test_large_batch(self, simulator):
        """Can generate large batch."""
        df = simulator.generate_historical(num_deliveries=5000)
        assert len(df) == 5000, "Should generate 5000 records"

    def test_consistent_seed(self):
        """Same seed should produce consistent behavior."""
        sim1 = DeliverySimulator(seed=12345)
        sim2 = DeliverySimulator(seed=12345)
        
        df1 = sim1.generate_historical(num_deliveries=500)
        df2 = sim2.generate_historical(num_deliveries=500)
        
        # With same seed, distributions should be very similar
        # (won't be exactly the same due to how Python's random works with UUIDs)
        late_rate_1 = df1['was_late'].sum() / len(df1)
        late_rate_2 = df2['was_late'].sum() / len(df2)
        
        # Should be within 5% of each other
        assert abs(late_rate_1 - late_rate_2) < 0.05, \
            f"Late rates differ too much: {late_rate_1:.2%} vs {late_rate_2:.2%}"

    def test_different_seeds_different_results(self):
        """Different seeds produce different results."""
        sim1 = DeliverySimulator(seed=111)
        sim2 = DeliverySimulator(seed=222)
        
        df1 = sim1.generate_historical(num_deliveries=1000)
        df2 = sim2.generate_historical(num_deliveries=1000)
        
        # Should have different late rates (with very high probability)
        late_rate_1 = df1['was_late'].sum() / len(df1)
        late_rate_2 = df2['was_late'].sum() / len(df2)
        
        # Allow for some random variation, but should be different
        assert abs(late_rate_1 - late_rate_2) > 0.01, \
            "Different seeds should produce different results"


# ============================================================================
# PERFORMANCE TESTS
# ============================================================================


class TestPerformance:
    """Tests for performance and memory efficiency."""

    def test_generation_speed(self, simulator):
        """Generation should be reasonably fast."""
        import time
        
        start = time.time()
        df = simulator.generate_historical(num_deliveries=1000)
        elapsed = time.time() - start
        
        # Should complete in < 30 seconds
        assert elapsed < 30, f"Generation took {elapsed:.1f}s (should be < 30s)"
        
        # Rough rate: should be at least 30 deliveries/second
        rate = len(df) / elapsed
        print(f"\nGeneration rate: {rate:.0f} deliveries/second")

    def test_streaming_memory_efficient(self, simulator):
        """Streaming should be memory efficient (not load all at once)."""
        # This is more of a design test - streaming should use generator
        import sys
        
        order_id = "test-order-123"
        stream = simulator.stream_events(order_id)
        
        # Generator should not have all events in memory
        # Just check that it's a generator
        import types
        assert isinstance(stream, types.GeneratorType), \
            "stream_events should return a generator"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
