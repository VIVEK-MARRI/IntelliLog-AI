from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from src.ml.feature_engineering import FeatureBuilder, FeatureStats

from tests.fixtures.factories import HistoricalDeliveryFactory, LiveOrderStateFactory


def test_feature_names_are_stable() -> None:
    builder = FeatureBuilder()

    assert builder.get_feature_names() == [
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


def test_build_from_historical_and_live_match_shapes() -> None:
    builder = FeatureBuilder()
    historical = builder.build_from_historical(pd.Series(HistoricalDeliveryFactory()))
    live = builder.build_from_live(LiveOrderStateFactory(), {"driver_on_time_rate": 0.9})

    assert list(historical.keys()) == list(live.keys())
    assert len(historical) == 14
    assert len(live) == 14
    assert all(np.isfinite(value) for value in historical.values())
    assert all(np.isfinite(value) for value in live.values())


def test_validate_features_rejects_missing_and_nan_values() -> None:
    builder = FeatureBuilder()
    features = builder.build_from_live(LiveOrderStateFactory(), {"driver_on_time_rate": 0.9})

    assert builder.validate_features(features) is True

    with pytest.raises(ValueError, match="Missing feature"):
        builder.validate_features({"stops_remaining_ratio": 0.5})

    with pytest.raises(ValueError, match="is NaN"):
        builder.validate_features({name: np.nan for name in builder.get_feature_names()})


def test_compute_feature_stats_and_impute_features() -> None:
    builder = FeatureBuilder()
    df = pd.DataFrame([HistoricalDeliveryFactory() for _ in range(3)])
    stats = builder.compute_feature_stats(df)

    assert isinstance(stats, FeatureStats)
    assert len(stats.feature_medians) == 14

    features = {name: np.nan if index % 2 == 0 else 0.7 for index, name in enumerate(builder.get_feature_names())}
    imputed = builder.impute_features(features, stats)

    assert all(not pd.isna(value) for value in imputed.values())
