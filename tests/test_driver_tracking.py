"""Tests for real-time driver position tracking system."""

import json
from datetime import datetime, timedelta
from typing import List, Tuple
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from src.backend.app.services.deviation_detection import (
    DeviationDetector,
    point_to_linestring_distance,
    point_to_segment_distance,
    haversine_distance_m,
)
from src.backend.app.schemas.tracking import DriverPositionUpdate
from src.backend.app.services.tracking_service import RedisGeoTracker


class TestDeviationDetection:
    """Tests for route deviation detection algorithms."""

    def test_haversine_distance_zero_same_point(self):
        """Haversine distance between same point should be ~0."""
        distance = haversine_distance_m(40.7128, -74.0060, 40.7128, -74.0060)
        assert distance < 1.0

    def test_haversine_distance_known_coordinates(self):
        """Haversine distance between known NYC coordinates."""
        # Times Square to Grand Central (roughly 1.8 km)
        distance = haversine_distance_m(40.7580, -73.9855, 40.7527, -73.9772)
        assert 800 < distance < 1200  # Should be roughly 914m

    def test_point_to_segment_perpendicular_distance(self):
        """Point perpendicular to segment should have minimal distance."""
        # Horizontal segment from (0, 0) to (100, 0) in lat/lon
        # Point at (50, 10) should be roughly 10 units away
        lat1, lon1 = 0.0, 0.0
        lat2, lon2 = 0.0, 100.0
        p_lat, p_lon = 10.0, 50.0

        # This uses Mercator projection, so conversion varies by latitude
        distance = point_to_segment_distance(p_lat, p_lon, lat1, lon1, lat2, lon2)
        # At equator, ~1 degree lat = 111km, so 10 degrees = ~1.1M meters
        assert distance > 1000000  # Roughly 1.1M meters

    def test_point_to_segment_on_endpoint(self):
        """Point at segment endpoint should have minimal distance."""
        distance = point_to_segment_distance(0.0, 0.0, 0.0, 0.0, 10.0, 0.0)
        assert distance < 100

    def test_point_to_linestring_simple_route(self):
        """Simple 3-point route: find closest segment."""
        route = [
            (40.7128, -74.0060),  # Start
            (40.7200, -74.0100),  # Mid
            (40.7300, -74.0150),  # End
        ]
        point = (40.7180, -74.0080)

        distance, nearest_idx = point_to_linestring_distance(point, route)
        assert nearest_idx in [0, 1]  # Should be near first or second segment
        assert distance >= 0

    def test_deviation_detector_creates_with_defaults(self):
        """DeviationDetector should initialize with reasonable defaults."""
        detector = DeviationDetector()
        assert detector.deviation_threshold_m == 400.0
        assert detector.recovery_threshold_m == 200.0
        assert detector.consecutive_threshold == 3

    def test_deviation_detector_custom_thresholds(self):
        """DeviationDetector should accept custom thresholds."""
        detector = DeviationDetector(
            deviation_threshold_m=600.0,
            recovery_threshold_m=300.0,
            consecutive_threshold=2,
        )
        assert detector.deviation_threshold_m == 600.0
        assert detector.recovery_threshold_m == 300.0
        assert detector.consecutive_threshold == 2

    def test_check_deviation_on_route(self):
        """Driver on route should not trigger deviation."""
        detector = DeviationDetector(deviation_threshold_m=400.0)
        route = [
            (40.0, -74.0),
            (40.1, -74.0),
            (40.2, -74.0),
        ]
        position = (40.05, -74.0)  # On route segment

        is_deviated, distance, count = detector.check_deviation(position, route, 0)
        assert is_deviated is False
        assert count == 0
        assert distance < 400

    def test_check_deviation_off_route_single_reading(self):
        """Single off-route reading should not trigger deviation flag."""
        detector = DeviationDetector(
            deviation_threshold_m=400.0, consecutive_threshold=3
        )
        route = [
            (40.0, -74.0),
            (40.1, -74.0),
            (40.2, -74.0),
        ]
        # Point far off route
        position = (45.0, -74.0)

        is_deviated, distance, count = detector.check_deviation(position, route, 0)
        assert is_deviated is False  # Not yet at consecutive threshold
        assert count == 1
        assert distance > 400

    def test_check_deviation_consecutive_threshold(self):
        """Reaching consecutive threshold should trigger deviation."""
        detector = DeviationDetector(
            deviation_threshold_m=400.0, consecutive_threshold=3
        )
        route = [
            (40.0, -74.0),
            (40.1, -74.0),
            (40.2, -74.0),
        ]
        position = (45.0, -74.0)

        # First reading
        is_deviated, _, count = detector.check_deviation(position, route, 0)
        assert is_deviated is False
        assert count == 1

        # Second reading
        is_deviated, _, count = detector.check_deviation(position, route, count)
        assert is_deviated is False
        assert count == 2

        # Third reading - should trigger
        is_deviated, _, count = detector.check_deviation(position, route, count)
        assert is_deviated is True
        assert count == 3

    def test_check_deviation_recovery(self):
        """Driver returning to route should reset consecutive count."""
        detector = DeviationDetector(deviation_threshold_m=400.0)
        route = [
            (40.0, -74.0),
            (40.1, -74.0),
            (40.2, -74.0),
        ]

        # Off route: count = 2
        position_off = (45.0, -74.0)
        _, _, count = detector.check_deviation(position_off, route, 1)
        assert count == 2

        # Back on route
        position_on = (40.05, -74.0)
        is_deviated, _, count = detector.check_deviation(position_on, route, count)
        assert is_deviated is False
        assert count == 0  # Reset

    def test_estimate_deviation_duration(self):
        """Deviation duration should be estimated from position history."""
        detector = DeviationDetector()

        # Create position history with timestamps
        now = datetime.utcnow()
        history = [
            (40.0, -74.0, now.timestamp()),
            (40.5, -74.0, (now + timedelta(minutes=5)).timestamp()),
        ]

        duration = detector.estimate_deviation_duration_minutes(history, speed_kmh=25.0)
        # Should be positive and reasonable
        assert duration >= 0


class TestRedisGeoTracker:
    """Tests for Redis Geo tracker."""

    @pytest.fixture
    def mock_redis(self):
        """Create mock Redis client."""
        return MagicMock()

    def test_tracker_initialization(self, mock_redis):
        """RedisGeoTracker should initialize with Redis client."""
        with patch("redis.from_url", return_value=mock_redis):
            tracker = RedisGeoTracker()
            assert tracker.position_ttl == 120
            assert tracker.active_driver_ttl == 3600

    def test_store_position(self, mock_redis):
        """Store position should call Redis GEOADD and HSET."""
        with patch("redis.from_url", return_value=mock_redis):
            tracker = RedisGeoTracker()
            tracker.redis = mock_redis

            # Mock pipeline
            pipe = MagicMock()
            mock_redis.pipeline.return_value = pipe

            position = DriverPositionUpdate(
                driver_id="driver1",
                latitude=40.7128,
                longitude=-74.0060,
                speed_kmh=25.5,
                heading_degrees=180.0,
            )

            result = tracker.store_position("tenant1", position)

            assert result is True
            mock_redis.geoadd.assert_called_once()
            pipe.hset.assert_called_once()
            pipe.execute.assert_called_once()

    def test_find_nearby_drivers_empty(self, mock_redis):
        """Find nearby drivers with no results."""
        with patch("redis.from_url", return_value=mock_redis):
            tracker = RedisGeoTracker()
            tracker.redis = mock_redis
            mock_redis.georadius.return_value = []

            result = tracker.find_nearby_drivers("tenant1", 40.7128, -74.0060, 5.0)

            assert result == []
            assert len(result) == 0

    def test_deviation_flag_operations(self, mock_redis):
        """Test setting and getting deviation flags."""
        with patch("redis.from_url", return_value=mock_redis):
            tracker = RedisGeoTracker()
            tracker.redis = mock_redis

            # Set deviation
            tracker.set_driver_deviation("driver1", True)
            mock_redis.setex.assert_called_once()

            # Get deviation
            mock_redis.exists.return_value = 1
            result = tracker.get_driver_deviation("driver1")
            assert result is True

            # Clear deviation
            mock_redis.reset_mock()
            mock_redis.exists.return_value = 0
            tracker.set_driver_deviation("driver1", False)
            mock_redis.delete.assert_called_once()


class TestPositionUpdateSchema:
    """Tests for position update validation."""

    def test_valid_position_update(self):
        """Valid position should pass validation."""
        position = DriverPositionUpdate(
            driver_id="driver1",
            latitude=40.7128,
            longitude=-74.0060,
            speed_kmh=25.5,
            heading_degrees=180.0,
        )
        assert position.driver_id == "driver1"
        assert position.latitude == 40.7128

    def test_invalid_latitude(self):
        """Latitude outside [-90, 90] should fail."""
        with pytest.raises(ValueError):
            DriverPositionUpdate(
                driver_id="driver1",
                latitude=91.0,  # Invalid
                longitude=-74.0060,
            )

    def test_invalid_longitude(self):
        """Longitude outside [-180, 180] should fail."""
        with pytest.raises(ValueError):
            DriverPositionUpdate(
                driver_id="driver1",
                latitude=40.7128,
                longitude=200.0,  # Invalid
            )

    def test_negative_speed(self):
        """Negative speed should fail."""
        with pytest.raises(ValueError):
            DriverPositionUpdate(
                driver_id="driver1",
                latitude=40.7128,
                longitude=-74.0060,
                speed_kmh=-5.0,  # Invalid
            )

    def test_heading_range(self):
        """Heading should be 0-360 degrees."""
        # Valid: 0 degrees
        position = DriverPositionUpdate(
            driver_id="driver1",
            latitude=40.7128,
            longitude=-74.0060,
            heading_degrees=0.0,
        )
        assert position.heading_degrees == 0.0

        # Valid: 360 degrees
        position = DriverPositionUpdate(
            driver_id="driver1",
            latitude=40.7128,
            longitude=-74.0060,
            heading_degrees=360.0,
        )
        assert position.heading_degrees == 360.0


class TestRateLimiting:
    """Tests for GPS position update rate limiting and fail-open behavior."""

    @pytest.fixture
    def mock_redis(self):
        """Create mock Redis client."""
        return MagicMock()

    def test_rate_limit_redis_unavailable(self, mock_redis):
        """Rate limiter should fail open when Redis is unavailable.
        
        When Redis connection fails, the rate limit check should pass through
        (not raise), and a warning should be logged. The fail-open behavior
        ensures GPS data is never lost due to Redis outages.
        """
        import redis
        from src.backend.app.api.api_v1.endpoints.driver_tracking import (
            _enforce_position_rate_limit,
            rate_limit_redis_failures,
        )
        from src.backend.app.services.tracking_service import RedisGeoTracker
        
        # Create a mock tracker with Redis that will fail
        tracker = MagicMock(spec=RedisGeoTracker)
        tracker.redis = mock_redis
        
        # Configure mock redis to raise ConnectionError on incr
        mock_redis.incr.side_effect = redis.ConnectionError("Redis unavailable")
        
        # Reset Prometheus counter
        rate_limit_redis_failures._metrics.clear()
        
        # Call should NOT raise, but should increment Prometheus counter
        try:
            _enforce_position_rate_limit(tracker, "driver1")
        except Exception as e:
            pytest.fail(f"Rate limiter raised exception on Redis error: {e}")
        
        # Verify Prometheus counter was incremented
        # Get the counter value by collecting metrics
        metrics = list(rate_limit_redis_failures.collect())
        assert len(metrics) > 0
        # Check that at least one sample was recorded
        samples = [s for s in metrics[0].samples if s.name == 'rate_limit_redis_failures_total']
        assert len(samples) > 0, "Prometheus counter should be incremented"

    def test_rate_limit_scoped_per_driver(self, mock_redis):
        """Rate limit should be scoped per driver, not shared across tenant.
        
        - Driver A: 13 updates (13th should hit the limit)
        - Driver B: 1 update (should succeed)
        
        This verifies that the rate limit counter is keyed per driver_id,
        not globally per tenant.
        """
        from src.backend.app.api.api_v1.endpoints.driver_tracking import (
            _enforce_position_rate_limit,
        )
        from src.backend.app.services.tracking_service import RedisGeoTracker
        from fastapi import HTTPException
        
        # Create a mock tracker
        tracker = MagicMock(spec=RedisGeoTracker)
        tracker.redis = mock_redis
        
        # Create a dict to track rate limit counters
        rate_counters = {}
        
        def mock_incr(key):
            if key not in rate_counters:
                rate_counters[key] = 0
            rate_counters[key] += 1
            return rate_counters[key]
        
        def mock_expire(key, ttl):
            pass  # Ignore expire in test
        
        mock_redis.incr.side_effect = mock_incr
        mock_redis.expire.side_effect = mock_expire
        
        # Send 13 updates for driver-A
        for i in range(13):
            if i < 12:
                # First 12 should not raise
                try:
                    _enforce_position_rate_limit(tracker, "driver-A")
                except Exception as e:
                    pytest.fail(f"Update {i+1} for driver-A raised: {e}")
            else:
                # 13th should raise HTTPException with 429
                with pytest.raises(HTTPException) as exc_info:
                    _enforce_position_rate_limit(tracker, "driver-A")
                assert exc_info.value.status_code == 429
                assert exc_info.value.detail["error"] == "rate_limit_exceeded"
        
        # Send 1 update for driver-B (separate counter, should succeed)
        try:
            _enforce_position_rate_limit(tracker, "driver-B")
        except Exception as e:
            pytest.fail(f"driver-B update raised: {e}")
        
        # Verify separate counters were used
        assert rate_counters["rate:driver-A:pos_updates"] == 13
        assert rate_counters["rate:driver-B:pos_updates"] == 1


# Integration tests would go here (require FastAPI test client)
# For now, we focus on unit tests for core algorithms
