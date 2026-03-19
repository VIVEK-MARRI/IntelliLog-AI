#!/usr/bin/env python3
"""
Quick Integration Verification Script
Tests that all traffic awareness components are working correctly.

Usage:
    python verify_traffic_integration.py [--verbose]
"""

import asyncio
import sys
from datetime import datetime
from pathlib import Path

# Color codes for terminal output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
RESET = "\033[0m"


def print_status(message: str, status: bool, details: str = ""):
    """Print status message with color."""
    icon = f"{GREEN}✓{RESET}" if status else f"{RED}✗{RESET}"
    print(f"{icon} {message}")
    if details:
        print(f"  {BLUE}→{RESET} {details}")


def print_section(title: str):
    """Print section header."""
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}{title:^60}{RESET}")
    print(f"{BLUE}{'='*60}{RESET}\n")


async def verify_imports():
    """Verify all necessary modules can be imported."""
    print_section("1. Verifying Imports")

    modules = [
        ("aiohttp", "Async HTTP client"),
        ("sqlalchemy", "Database ORM"),
        ("prometheus_client", "Metrics"),
        ("pandas", "Data processing"),
        ("xgboost", "ML model"),
        ("celery", "Task queue"),
        ("redis", "Cache backend"),
    ]

    all_ok = True
    for module_name, description in modules:
        try:
            __import__(module_name)
            print_status(f"Import {module_name}", True, description)
        except ImportError as e:
            print_status(f"Import {module_name}", False, str(e))
            all_ok = False

    return all_ok


async def verify_files_exist():
    """Verify all new files exist."""
    print_section("2. Verifying File Structure")

    files = [
        "src/ml/features/engineering.py",
        "src/ml/features/traffic_client.py",
        "src/ml/features/traffic_cache.py",
        "src/ml/features/weather_client.py",
        "tests/test_traffic_integration.py",
        "alembic/versions/2026_03_19_traffic_patterns.py",
        "docs/TRAFFIC_AWARENESS_GUIDE.md",
        "docs/TRAFFIC_COMPLETION_SUMMARY.md",
    ]

    all_ok = True
    for file_path in files:
        exists = Path(file_path).exists()
        print_status(f"File {file_path}", exists)
        all_ok = all_ok and exists

    return all_ok


async def verify_traffic_client():
    """Verify traffic client can be imported and instantiated."""
    print_section("3. Verifying Traffic Client")

    try:
        from src.ml.features.traffic_client import (
            LatLon,
            TrafficData,
            GoogleMapsTrafficClient,
            HERETrafficClient,
            TrafficClient,
        )

        # Test coordinate validation
        print_status("Import LatLon", True)
        loc = LatLon(lat=40.7128, lng=-74.0060)
        print_status("Create valid LatLon", True, f"NYC: {loc.lat}, {loc.lng}")

        # Test invalid coordinates
        try:
            bad_loc = LatLon(lat=91.0, lng=0.0)
            print_status("Reject invalid latitude", False)
        except ValueError:
            print_status("Reject invalid latitude", True, "ValueError raised as expected")

        # Test TrafficData
        data = TrafficData(duration_sec=900, distance_meters=2500, traffic_ratio=1.2)
        print_status("Create TrafficData", True, f"Duration: {data.duration_sec}s, Ratio: {data.traffic_ratio}")

        # Test client instantiation
        print_status("Import GoogleMapsTrafficClient", True)
        google_client = GoogleMapsTrafficClient(api_key="test_key")
        print_status("Instantiate GoogleMapsTrafficClient", True)

        print_status("Import HERETrafficClient", True)
        here_client = HERETrafficClient(api_key="test_key")
        print_status("Instantiate HERETrafficClient", True)

        return True

    except Exception as e:
        print_status("Traffic client verification", False, str(e))
        return False


async def verify_traffic_cache():
    """Verify traffic cache can be imported."""
    print_section("4. Verifying Traffic Cache")

    try:
        from src.ml.features.traffic_cache import TrafficCache, TrafficCacheManager

        print_status("Import TrafficCache", True)
        cache = TrafficCache(db_session=None, redis_url="redis://localhost:6379")
        print_status("Instantiate TrafficCache", True)

        # Test zone ID generation
        zone_id = cache._generate_zone_id(40.7128, -74.0060)
        print_status("Generate zone ID", True, f"Zone: {zone_id}")

        # Test cache key generation
        key = cache._generate_cache_key("live", "zone1", "zone2", 1, 9)
        print_status("Generate cache key", True, f"Key: {key}")

        return True

    except Exception as e:
        print_status("Traffic cache verification", False, str(e))
        return False


async def verify_weather_client():
    """Verify weather client can be imported."""
    print_section("5. Verifying Weather Client")

    try:
        from src.ml.features.weather_client import WeatherClient

        print_status("Import WeatherClient", True)
        client = WeatherClient(api_key="test_key")
        print_status("Instantiate WeatherClient", True)

        return True

    except Exception as e:
        print_status("Weather client verification", False, str(e))
        return False


async def verify_feature_engineer():
    """Verify feature engineer can be imported."""
    print_section("6. Verifying Feature Engineer")

    try:
        from src.ml.features.engineering import TrafficFeatureEngineer

        print_status("Import TrafficFeatureEngineer", True)
        engineer = TrafficFeatureEngineer(db_session=None)
        print_status("Instantiate TrafficFeatureEngineer", True)

        # Test metadata
        metadata = engineer.get_feature_importance_metadata()
        print_status("Get feature importance metadata", True, f"Features: {len(metadata['traffic_features'])}")

        expected_features = [
            "current_traffic_ratio",
            "historical_avg_traffic_same_hour",
            "historical_std_traffic_same_hour",
            "is_peak_hour",
            "weather_severity",
            "effective_travel_time_min",
        ]

        all_features_present = all(f in metadata["traffic_features"] for f in expected_features)
        print_status("All 6 traffic features present", all_features_present)

        return all_features_present

    except Exception as e:
        print_status("Feature engineer verification", False, str(e))
        return False


async def verify_celery_tasks():
    """Verify Celery tasks are configured."""
    print_section("7. Verifying Celery Tasks")

    try:
        from src.ml.continuous_learning.celery_tasks import app

        print_status("Import Celery app", True)

        # Check beat schedule
        beat_schedule = app.conf.beat_schedule
        print_status("Get beat_schedule", True, f"Tasks: {len(beat_schedule)}")

        expected_tasks = [
            "retrain-models",
            "aggregate-traffic-patterns",
            "detect-drift",
            "check-staging-models",
            "update-metrics",
        ]

        for task_name in expected_tasks:
            exists = task_name in beat_schedule
            print_status(f"  Task: {task_name}", exists)

        return all(task in beat_schedule for task in expected_tasks)

    except Exception as e:
        print_status("Celery tasks verification", False, str(e))
        return False


async def verify_metrics():
    """Verify Prometheus metrics are defined."""
    print_section("8. Verifying Prometheus Metrics")

    try:
        from src.ml.continuous_learning.metrics_collector import (
            traffic_api_failure_rate,
            traffic_cache_hit_rate,
            traffic_ratio_by_hour,
            traffic_features_importance,
            traffic_api_cost_total,
            traffic_api_latency_seconds,
        )

        metrics = [
            ("traffic_api_failure_rate", traffic_api_failure_rate),
            ("traffic_cache_hit_rate", traffic_cache_hit_rate),
            ("traffic_ratio_by_hour", traffic_ratio_by_hour),
            ("traffic_features_importance", traffic_features_importance),
            ("traffic_api_cost_total", traffic_api_cost_total),
            ("traffic_api_latency_seconds", traffic_api_latency_seconds),
        ]

        for metric_name, metric_obj in metrics:
            print_status(f"Define {metric_name}", True)

        return True

    except Exception as e:
        print_status("Prometheus metrics verification", False, str(e))
        return False


async def verify_model_integration():
    """Verify model retrainer includes traffic features."""
    print_section("9. Verifying Model Integration")

    try:
        from src.ml.continuous_learning.model_retrainer import ModelRetrainer

        print_status("Import ModelRetrainer", True)

        # Check that _prepare_features method exists
        import inspect

        source = inspect.getsource(ModelRetrainer._prepare_features)
        has_traffic_features = "traffic" in source.lower()
        print_status("_prepare_features includes traffic", has_traffic_features)

        has_async = "async" in source
        print_status("_prepare_features uses async", has_async)

        return has_traffic_features and has_async

    except Exception as e:
        print_status("Model integration verification", False, str(e))
        return False


async def verify_database_model():
    """Verify TrafficPattern database model."""
    print_section("10. Verifying Database Model")

    try:
        from src.backend.app.db.models import TrafficPattern

        print_status("Import TrafficPattern model", True)

        # Check attributes
        expected_attrs = [
            "zone_origin",
            "zone_dest",
            "weekday",
            "hour",
            "avg_traffic_ratio",
            "std_traffic_ratio",
            "avg_travel_time_min",
            "avg_distance_meters",
            "sample_count",
            "last_updated",
        ]

        for attr in expected_attrs:
            has_attr = hasattr(TrafficPattern, attr)
            print_status(f"  Attribute: {attr}", has_attr)

        return all(hasattr(TrafficPattern, attr) for attr in expected_attrs)

    except Exception as e:
        print_status("Database model verification", False, str(e))
        return False


async def verify_configuration():
    """Verify configuration variables."""
    print_section("11. Verifying Configuration")

    try:
        from src.backend.app.core.config import settings

        config_vars = [
            "GOOGLE_MAPS_API_KEY",
            "HERE_API_KEY",
            "OPENWEATHER_API_KEY",
            "TRAFFIC_API_ENABLED",
            "TRAFFIC_RETRY_ATTEMPTS",
            "TRAFFIC_CACHE_TTL_MIN",
        ]

        for var in config_vars:
            has_var = hasattr(settings, var)
            print_status(f"  Config: {var}", has_var)

        return all(hasattr(settings, var) for var in config_vars)

    except Exception as e:
        print_status("Configuration verification", False, str(e))
        return False


async def main():
    """Run all verification tests."""
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}{'Traffic Awareness Layer - Integration Verification':^60}{RESET}")
    print(f"{BLUE}{'='*60}{RESET}")
    print(f"Started: {datetime.utcnow().isoformat()}Z\n")

    results = []

    results.append(("Imports", await verify_imports()))
    results.append(("Files", await verify_files_exist()))
    results.append(("Traffic Client", await verify_traffic_client()))
    results.append(("Traffic Cache", await verify_traffic_cache()))
    results.append(("Weather Client", await verify_weather_client()))
    results.append(("Feature Engineer", await verify_feature_engineer()))
    results.append(("Celery Tasks", await verify_celery_tasks()))
    results.append(("Prometheus Metrics", await verify_metrics()))
    results.append(("Model Integration", await verify_model_integration()))
    results.append(("Database Model", await verify_database_model()))
    results.append(("Configuration", await verify_configuration()))

    # Summary
    print_section("Summary")

    passed = sum(1 for _, result in results if result)
    total = len(results)

    print(f"Tests Passed: {passed}/{total}\n")

    for test_name, result in results:
        status_icon = f"{GREEN}✓{RESET}" if result else f"{RED}✗{RESET}"
        print(f"  {status_icon} {test_name}")

    print(f"\n{BLUE}{'='*60}{RESET}")

    if passed == total:
        print(f"{GREEN}All verification tests passed!{RESET}")
        print(f"\nNext steps:")
        print(f"  1. Set environment variables (API keys)")
        print(f"  2. Run: alembic upgrade head")
        print(f"  3. Run: pytest tests/test_traffic_integration.py -v")
        print(f"  4. Deploy and monitor Prometheus metrics")
        return 0
    else:
        print(f"{RED}Some verification tests failed.{RESET}")
        print(f"\nFailed tests: {total - passed}")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
