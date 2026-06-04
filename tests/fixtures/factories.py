"""Factory Boy fixtures for requests, payloads, and domain objects."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import factory


def _future_eta(hours: int = 2) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()


class StopFactory(factory.DictFactory):
    lat = factory.Sequence(lambda n: 40.7128 + n * 0.01)
    lng = factory.Sequence(lambda n: -74.0060 - n * 0.01)
    address = factory.Sequence(lambda n: f"{100 + n} Main Street")
    customer_name = factory.Sequence(lambda n: f"Customer {n}")
    service_duration_minutes = 5.0


class OrderRequestFactory(factory.DictFactory):
    orderId = factory.Sequence(lambda n: f"order-{n:04d}")
    driverId = factory.Sequence(lambda n: f"driver-{n:04d}")
    plannedEta = factory.LazyFunction(_future_eta)
    stops = factory.LazyFunction(lambda: [StopFactory()])
    notes = "High-priority delivery"


class PositionUpdateFactory(factory.DictFactory):
    lat = 40.7128
    lng = -74.0060
    speed_kmh = 42.0
    heading = 180.0
    event_type = "gps_ping"


class HistoricalDeliveryFactory(factory.DictFactory):
    planned_stops = 10
    actual_stops = 10
    completed_stops = 10
    planned_duration_minutes = 240.0
    actual_duration_minutes = 250.0
    avg_speed_kmh = 35.0
    stop_dwell_time_avg_minutes = 5.0
    driver_historical_on_time_rate = 0.85
    hour_of_day_start = 14
    day_of_week = 2
    distance_km = 150.0


class LiveOrderStateFactory(factory.DictFactory):
    order_id = factory.Sequence(lambda n: f"order-{n:04d}")
    planned_stops = 10
    completed_stops = 5
    planned_duration_minutes = 240.0
    actual_duration_so_far_minutes = 120.0
    stops_remaining = 5
    eta_minutes_remaining = 120.0
    speed = 35.0
    deviation_meters = 100.0
    hour_of_day = 14
    day_of_week = 2
    avg_stop_dwell_minutes = 5.0


class DriverStatsFactory(factory.DictFactory):
    driver_on_time_rate = 0.85


class GPSPingFactory(factory.DictFactory):
    lat = factory.Sequence(lambda n: 40.7128 + n * 0.001)
    lng = factory.Sequence(lambda n: -74.0060 - n * 0.001)
    speed_kmh = factory.Sequence(lambda n: 35.0 + n)
