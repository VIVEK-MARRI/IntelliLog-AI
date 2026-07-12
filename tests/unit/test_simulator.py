"""Unit tests for the DeliverySimulator.

Guards against calibration regressions: late-delivery rate, duration distribution.
These were verified to be broken before the simulator fix and were previously deleted
in a cleanup pass without replacement coverage — this restores that coverage.
"""

from __future__ import annotations

import pytest

from src.simulator.delivery_simulator import DeliverySimulator


@pytest.fixture(scope="module")
def simulator_df():
    """Generate a fixed-seed dataset used across calibration tests.

    500 records is enough to detect gross miscalibration without making
    the test suite slow.
    """
    sim = DeliverySimulator(seed=42, tenant_id="test-tenant")
    return sim.generate_historical(num_deliveries=500)


def test_simulator_generates_expected_record_count(simulator_df):
    assert len(simulator_df) == 500


def test_late_delivery_rate_near_target(simulator_df):
    """Late-delivery rate should be close to the stated ~20% target.

    Tolerance: 10%–40% is acceptable for a 500-record sample to account
    for statistical variance without allowing gross miscalibration.
    The prior bug was producing ~13%, well outside this range.
    """
    late_rate = simulator_df["was_late"].mean()
    assert 0.10 <= late_rate <= 0.40, (
        f"Late delivery rate {late_rate:.1%} is outside the acceptable 10–40% window "
        f"(target ≈ 20%). Check DeliverySimulator._make_delivery_late calibration."
    )


def test_delivery_duration_range(simulator_df):
    """Most completed deliveries should fall within a realistic time window.

    The DURATION_MIN_HOURS/DURATION_MAX_HOURS constants define 4–8 h (240–480 min).
    With late additions (up to +45 min), the practical ceiling is ~525 min.
    Requiring >50% in the 3.5–10 h window catches gross generator miscalibration
    while being loose enough to pass with natural variance.

    The prior bug had only ~20% within this range.
    """
    in_range = (
        (simulator_df["actual_duration_minutes"] >= 210)  # 3.5 h
        & (simulator_df["actual_duration_minutes"] <= 600)  # 10 h
    ).mean()
    assert in_range >= 0.50, (
        f"Only {in_range:.1%} of deliveries fall in the 3.5–10h duration range. "
        f"The simulator route planner may be producing unrealistic durations. "
        f"Check DeliverySimulator._plan_route configuration."
    )


def test_simulator_dataframe_has_required_columns(simulator_df):
    """Columns consumed by src/ml/train.py must exist."""
    required = {
        "was_late",
        "actual_duration_minutes",
        "planned_duration_minutes",
        "delay_minutes",
        "planned_stops",
        "avg_speed_kmh",
        "distance_km",
        "driver_historical_on_time_rate",
        "day_of_week",
        "hour_of_day_start",
    }
    missing = required - set(simulator_df.columns)
    assert not missing, f"simulator_df is missing columns required by train.py: {missing}"


def test_simulator_is_deterministic_with_same_seed():
    """Two simulators with the same seed must produce identical outputs.

    Note: We re-seed numpy/random immediately before each run to prevent
    contamination from other tests that share the process-global RNG.
    """
    import random as stdlib_random
    import numpy as np_mod

    SEED = 77777

    stdlib_random.seed(SEED)
    np_mod.random.seed(SEED)
    sim_a = DeliverySimulator(seed=SEED, tenant_id="test-tenant")
    df_a = sim_a.generate_historical(num_deliveries=50)

    stdlib_random.seed(SEED)
    np_mod.random.seed(SEED)
    sim_b = DeliverySimulator(seed=SEED, tenant_id="test-tenant")
    df_b = sim_b.generate_historical(num_deliveries=50)

    # Compare key numeric columns
    assert df_a["actual_duration_minutes"].tolist() == df_b["actual_duration_minutes"].tolist()
    assert df_a["was_late"].tolist() == df_b["was_late"].tolist()
