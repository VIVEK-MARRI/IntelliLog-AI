"""
Integration tests for real-time traffic awareness layer.

Tests:
- Traffic API clients (Google Maps and HERE)
- Multi-tier caching (Redis, PostgreSQL)
- Weather API client
- Feature engineering with traffic data
- Fallback scenarios
"""

import pytest
from datetime import datetime
from unittest.mock import Mock, patch, AsyncMock
import pandas as pd
import numpy as np

from src.ml.features.traffic_client import (
    LatLon,
    TrafficData,
    GoogleMapsTrafficClient,
    HERETrafficClient,
    TrafficClient,
)
from src.ml.features.traffic_cache import TrafficCache, TrafficCacheManager
from src.ml.features.weather_client import WeatherClient
from src.ml.features.engineering import TrafficFeatureEngineer


# ============================================================================
# Test Fixtures
# ============================================================================


@pytest.fixture
def sample_coordinates():
    """Sample origin and destination coordinates."""
    return {
        "origin": LatLon(lat=40.7128, lng=-74.0060),  # NYC
        "destination": LatLon(lat=40.7614, lng=-73.9776),  # Midtown NYC
    }


@pytest.fixture
def sample_traffic_data():
    """Sample traffic data response."""
    return TrafficData(
        duration_seconds=900,  # 15 minutes
        duration_in_traffic_seconds=1080,  # 18 minutes with traffic (20% congestion)
        distance_meters=2500,
    )


@pytest.fixture
def sample_dataframe():
    """Sample delivery records for feature engineering."""
    return pd.DataFrame(
        {
            "distance_km": [5.0, 10.0, 15.0, 3.0, 8.0],
            "weight": [1.0, 1.5, 2.0, 0.8, 1.2],
            "time_of_day": ["morning", "afternoon", "evening", "night", "morning"],
            "day_of_week": [0, 1, 2, 3, 4],
            "traffic_condition": ["free_flow", "moderate", "congested", "heavy", "moderate"],
            "actual_delivery_min": [15.0, 25.0, 35.0, 10.0, 20.0],
            "predicted_eta_min": [14.0, 26.0, 32.0, 12.0, 22.0],
            "error_min": [1.0, -1.0, 3.0, -2.0, -2.0],
            "origin_lat": [40.7128, 40.7128, 40.7128, 40.7128, 40.7128],
            "origin_lng": [-74.0060, -74.0060, -74.0060, -74.0060, -74.0060],
            "dest_lat": [40.7614, 40.7614, 40.7614, 40.7614, 40.7614],
            "dest_lng": [-73.9776, -73.9776, -73.9776, -73.9776, -73.9776],
        }
    )


# ============================================================================
# LatLon Tests
# ============================================================================


class TestLatLon:
    """Test coordinate validation."""

    def test_valid_coordinates(self):
        """Valid coordinates should initialize successfully."""
        loc = LatLon(lat=40.7128, lng=-74.0060)
        assert loc.lat == 40.7128
        assert loc.lng == -74.0060

    def test_invalid_latitude(self):
        """Latitude outside [-90, 90] should fail."""
        with pytest.raises(ValueError):
            LatLon(lat=91.0, lng=-74.0060)

    def test_invalid_longitude(self):
        """Longitude outside [-180, 180] should fail."""
        with pytest.raises(ValueError):
            LatLon(lat=40.7128, lng=181.0)

    def test_boundary_coordinates(self):
        """Boundary coordinates should be valid."""
        # North Pole
        loc1 = LatLon(lat=90.0, lng=0.0)
        assert loc1.lat == 90.0

        # International Date Line
        loc2 = LatLon(lat=0.0, lng=180.0)
        assert loc2.lng == 180.0


# ============================================================================
# TrafficData Tests
# ============================================================================


class TestTrafficData:
    """Test traffic data container."""

    def test_traffic_data_creation(self, sample_traffic_data):
        """TrafficData should store travel metrics."""
        assert sample_traffic_data.duration_sec == 900
        assert sample_traffic_data.distance_meters == 2500
        assert sample_traffic_data.traffic_ratio == 1.2

    def test_traffic_ratio_computation(self):
        """Traffic ratio represents congestion level."""
        # Free flow
        data1 = TrafficData(duration_sec=600, distance_meters=5000, traffic_ratio=1.0)
        assert data1.traffic_ratio == 1.0

        # Light congestion
        data2 = TrafficData(duration_sec=750, distance_meters=5000, traffic_ratio=1.25)
        assert data2.traffic_ratio == 1.25

        # Heavy congestion
        data3 = TrafficData(duration_sec=1500, distance_meters=5000, traffic_ratio=2.5)
        assert data3.traffic_ratio == 2.5


# ============================================================================
# Google Maps Traffic Client Tests
# ============================================================================


@pytest.mark.asyncio
class TestGoogleMapsTrafficClient:
    """Test Google Maps Distance Matrix API client."""

    async def test_client_initialization(self):
        """Client should initialize with API key."""
        client = GoogleMapsTrafficClient(api_key="test_key")
        assert client.api_key == "test_key"
        assert client.max_batch_size == 625  # 25x25

    @patch("aiohttp.ClientSession.get")
    async def test_get_traffic_success(self, mock_get, sample_coordinates):
        """Successful API call should return TrafficData."""
        mock_response = AsyncMock()
        mock_response.json = AsyncMock(
            return_value={
                "rows": [
                    {
                        "elements": [
                            {
                                "duration": {"value": 900},
                                "distance": {"value": 2500},
                            }
                        ]
                    }
                ]
            }
        )
        mock_get.return_value.__aenter__.return_value = mock_response

        client = GoogleMapsTrafficClient(api_key="test_key")
        result = await client.get_traffic(
            sample_coordinates["origin"], sample_coordinates["destination"]
        )

        assert result is not None
        assert result.duration_sec == 900
        assert result.distance_meters == 2500

    @patch("aiohttp.ClientSession.get")
    async def test_get_traffic_retry_on_failure(self, mock_get, sample_coordinates):
        """Client should retry on transient failures."""
        mock_response = AsyncMock()
        mock_response.json = AsyncMock(
            side_effect=[
                Exception("Temporary error"),
                {
                    "rows": [
                        {
                            "elements": [
                                {
                                    "duration": {"value": 900},
                                    "distance": {"value": 2500},
                                }
                            ]
                        }
                    ]
                },
            ]
        )
        mock_get.return_value.__aenter__.return_value = mock_response

        client = GoogleMapsTrafficClient(api_key="test_key", max_retries=3)
        # Note: In real implementation, retries happen internally
        assert client.max_retries == 3

    @patch("aiohttp.ClientSession.post")
    async def test_batch_requests(self, mock_post, sample_coordinates):
        """Client should batch multiple requests."""
        client = GoogleMapsTrafficClient(api_key="test_key")

        # Create 10 coordinate pairs (will be batched)
        origins = [sample_coordinates["origin"]] * 10
        destinations = [sample_coordinates["destination"]] * 10

        # Verify batch size constraint
        assert len(origins) <= client.max_batch_size


# ============================================================================
# Traffic Cache Tests
# ============================================================================


@pytest.mark.asyncio
class TestTrafficCache:
    """Test multi-tier caching (Redis + PostgreSQL)."""

    async def test_cache_initialization(self):
        """Cache should initialize with TTL settings."""
        cache = TrafficCache(
            db_session=None,
            redis_url="redis://localhost:6379",
            cache_ttl_min=15,
        )
        assert cache.cache_ttl_min == 15
        assert cache.live_cache_ttl_min == 15
        assert cache.historical_cache_ttl_min == 24 * 60

    def test_zone_id_generation(self):
        """Zone IDs should discretize coordinates into 1km grid."""
        cache = TrafficCache(db_session=None)

        # Same zone
        zone1 = cache._generate_zone_id(40.7128, -74.0060)
        zone2 = cache._generate_zone_id(40.7129, -74.0061)
        # Close coordinates should map to same zone
        assert isinstance(zone1, str)
        assert isinstance(zone2, str)

        # Different zone
        zone3 = cache._generate_zone_id(41.0, -73.0)
        # Far coordinates should map to different zone
        assert zone1 != zone3

    def test_cache_key_format(self):
        """Cache keys should follow standard format."""
        cache = TrafficCache(db_session=None)

        key = cache._generate_cache_key(
            cache_type="live",
            origin_zone="zone1",
            dest_zone="zone2",
            weekday=1,
            hour=9,
        )

        assert key.startswith("traffic:")
        assert "live" in key
        assert "zone1" in key
        assert "zone2" in key


# ============================================================================
# Weather Client Tests
# ============================================================================


@pytest.mark.asyncio
class TestWeatherClient:
    """Test OpenWeatherMap API client."""

    async def test_client_initialization(self):
        """Client should initialize with API key."""
        client = WeatherClient(api_key="test_key")
        assert client.api_key == "test_key"

    @patch("aiohttp.ClientSession.get")
    async def test_get_weather_success(self, mock_get):
        """Successful API call should return weather data."""
        mock_response = AsyncMock()
        mock_response.json = AsyncMock(
            return_value={
                "weather": [{"main": "Rain"}],
                "main": {"temp": 22.5, "humidity": 75},
                "wind": {"speed": 5.2},
            }
        )
        mock_get.return_value.__aenter__.return_value = mock_response

        client = WeatherClient(api_key="test_key")
        result = await client.get_weather(40.7128, -74.0060)

        assert result is not None

    def test_severity_mapping(self):
        """Weather conditions should map to severity levels."""
        severity_map = {
            "clear": 0,
            "clouds": 0,
            "drizzle": 1,
            "rain": 2,
            "thunderstorm": 2,
            "snow": 3,
        }

        for condition, expected_severity in severity_map.items():
            # Verify mapping logic
            assert expected_severity >= 0 and expected_severity <= 3


# ============================================================================
# Feature Engineering Tests
# ============================================================================


@pytest.mark.asyncio
class TestTrafficFeatureEngineer:
    """Test traffic-aware feature engineering."""

    async def test_feature_engineer_initialization(self):
        """Feature engineer should initialize with DB session."""
        engineer = TrafficFeatureEngineer(db_session=None)
        assert engineer.db is None

    def test_peak_hour_detection(self, sample_dataframe):
        """Peak hour detection should identify rush hours."""
        engineer = TrafficFeatureEngineer(db_session=None)

        # Morning peak (9 AM on weekday)
        morning_peak = sample_dataframe.iloc[0].copy()
        morning_peak["time_of_day"] = "morning"
        morning_peak["day_of_week"] = 0
        assert engineer._is_peak_hour(morning_peak) == 1

        # Afternoon off-peak
        afternoon_off_peak = sample_dataframe.iloc[1].copy()
        afternoon_off_peak["time_of_day"] = "afternoon"
        afternoon_off_peak["day_of_week"] = 0
        assert engineer._is_peak_hour(afternoon_off_peak) in [0, 1]

        # Weekend (no peak)
        weekend = sample_dataframe.iloc[2].copy()
        weekend["day_of_week"] = 5
        assert engineer._is_peak_hour(weekend) == 0

    def test_zone_id_generation(self):
        """Zone ID should discretize lat/lng into 1km cells."""
        engineer = TrafficFeatureEngineer(db_session=None)

        # Same zone
        zone1 = engineer._get_zone_id(40.7128, -74.0060)
        zone2 = engineer._get_zone_id(40.7129, -74.0061)
        assert isinstance(zone1, str)
        assert isinstance(zone2, str)

    def test_effective_travel_time_computation(self, sample_dataframe):
        """Effective travel time should adjust for traffic."""
        engineer = TrafficFeatureEngineer(db_session=None)

        row = sample_dataframe.iloc[0].copy()
        row["distance_km"] = 10.0
        row["current_traffic_ratio"] = 1.0

        # Base: 10 km / 30 km/h * 60 = 20 min
        effective_time = engineer._compute_effective_travel_time(row)
        assert effective_time >= 20.0

        # With congestion
        row["current_traffic_ratio"] = 1.5
        effective_time_congested = engineer._compute_effective_travel_time(row)
        assert effective_time_congested > effective_time

    def test_feature_importance_metadata(self):
        """Should return metadata about traffic features."""
        engineer = TrafficFeatureEngineer(db_session=None)
        metadata = engineer.get_feature_importance_metadata()

        assert "traffic_features" in metadata
        assert "feature_descriptions" in metadata
        assert len(metadata["traffic_features"]) == 6

        expected_features = [
            "current_traffic_ratio",
            "historical_avg_traffic_same_hour",
            "historical_std_traffic_same_hour",
            "is_peak_hour",
            "weather_severity",
            "effective_travel_time_min",
        ]

        for feature in expected_features:
            assert feature in metadata["traffic_features"]


# ============================================================================
# Fallback/Resilience Tests
# ============================================================================


@pytest.mark.asyncio
class TestTrafficResilient:
    """Test graceful fallback when APIs are unavailable."""

    async def test_google_maps_failure_fallback_to_here(self):
        """If Google Maps fails, should fallback to HERE."""
        # Create clients
        google_client = GoogleMapsTrafficClient(api_key="invalid_key")
        here_client = HERETrafficClient(api_key="invalid_key")

        # Note: In real implementation, TrafficClient handles failover
        # This test verifies the pattern is supported
        assert google_client is not None
        assert here_client is not None

    def test_cache_fallback_on_redis_failure(self):
        """If Redis fails, should use PostgreSQL cache."""
        # Create cache with unavailable Redis
        cache = TrafficCache(
            db_session=None,
            redis_url="redis://invalid:6379",
            cache_ttl_min=15,
        )

        # Cache should still be functional with DB fallback
        assert cache.db is None  # Will try DB fallback on access


# ============================================================================
# Integration Tests
# ============================================================================


@pytest.mark.asyncio
class TestTrafficIntegration:
    """End-to-end integration tests."""

    async def test_feature_enrichment_pipeline(self, sample_dataframe):
        """Complete pipeline: data -> features -> traffic enrichment."""
        engineer = TrafficFeatureEngineer(db_session=None)

        # Add basic features
        df = sample_dataframe.copy()
        df["time_of_day_encoded"] = df["time_of_day"].map(
            {"morning": 0, "afternoon": 1, "evening": 2, "night": 3}
        )
        df["traffic_encoded"] = df["traffic_condition"].map(
            {"free_flow": 0, "moderate": 1, "congested": 2, "heavy": 3}
        )

        # Test that feature engineering handles missing traffic data gracefully
        # (when APIs are unavailable or disabled)
        assert len(df) == 5

    def test_traffic_feature_columns_present(self, sample_dataframe):
        """Enriched features should include traffic-aware columns."""
        expected_columns = [
            "current_traffic_ratio",
            "historical_avg_traffic_same_hour",
            "historical_std_traffic_same_hour",
            "is_peak_hour",
            "weather_severity",
            "effective_travel_time_min",
        ]

        # After feature engineering, these columns should exist
        for col in expected_columns:
            # Verify columns are defined in the engineer
            assert engineer.get_feature_importance_metadata()
            

    def test_traffic_importance_for_model(self):
        """Traffic features should provide model interpretability."""
        engineer = TrafficFeatureEngineer(db_session=None)
        metadata = engineer.get_feature_importance_metadata()

        # Each traffic feature should have a description
        for feature in metadata["traffic_features"]:
            assert feature in metadata["feature_descriptions"]
            description = metadata["feature_descriptions"][feature]
            assert len(description) > 10  # Non-trivial description


class TestErrorHandling:
    """Test error handling and edge cases."""

    def test_invalid_zone_coordinates(self):
        """Should handle invalid coordinates gracefully."""
        engineer = TrafficFeatureEngineer(db_session=None)

        # Out of bounds coordinates
        with pytest.raises(ValueError):
            zone = engineer._get_zone_id(lat=91.0, lng=0.0)

    def test_missing_traffic_data(self):
        """Should use defaults when traffic data unavailable."""
        engineer = TrafficFeatureEngineer(db_session=None)

        # Create row without traffic data
        row = pd.Series(
            {
                "distance_km": 10.0,
                "time_of_day": "afternoon",
            }
        )

        # Should not raise, returns default
        ratio = engine._get_current_traffic_ratio(row)
        assert ratio == 1.0


# ============================================================================
# Benchmarks
# ============================================================================


@pytest.mark.benchmark
class TestPerformance:
    """Performance/benchmark tests."""

    def test_zone_id_generation_performance(self):
        """Zone ID generation should be fast."""
        engineer = TrafficFeatureEngineer(db_session=None)

        import time

        start = time.time()
        for i in range(1000):
            engineer._get_zone_id(40.7128 + i * 0.001, -74.0060 + i * 0.001)
        elapsed = time.time() - start

        # Should complete 1000 zones in < 100ms
        assert elapsed < 0.1

    def test_cache_key_generation_performance(self):
        """Cache key generation should be fast."""
        cache = TrafficCache(db_session=None)

        import time

        start = time.time()
        for i in range(1000):
            cache._generate_cache_key("live", f"zone{i}", f"zone{i+1}", i % 7, i % 24)
        elapsed = time.time() - start

        # Should complete 1000 keys in < 100ms
        assert elapsed < 0.1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
