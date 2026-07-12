from __future__ import annotations

import numpy as np
import pytest

from src.ml.feature_engineering import FeatureBuilder, FeatureStats
from src.ml.inference import PredictionResult, PredictionService

from tests.conftest import StubExplainer, StubPredictionModel
from tests.fixtures.factories import LiveOrderStateFactory


def build_service(score: float = 0.84) -> PredictionService:
    builder = FeatureBuilder()
    feature_names = builder.get_feature_names()
    service = PredictionService.__new__(PredictionService)
    service.model_dir = None
    service.feature_builder = builder
    service.feature_names = feature_names
    service.optimal_threshold = 0.7
    service.feature_stats = FeatureStats(
        feature_medians={name: 0.5 for name in feature_names},
        feature_mins={name: 0.0 for name in feature_names},
        feature_maxs={name: 1.0 for name in feature_names},
    )
    service.metadata = {"training_date": "2024-01-01"}
    service.model_version = "2024-01-01"
    service.model = StubPredictionModel(score)
    service._explainer = StubExplainer([0.7, -0.5, 0.3, 0.2, -0.1, 0.05, 0.04, 0.03, 0.02, 0.01, 0.0, -0.01, -0.02, 0.03])
    return service


def test_predict_returns_high_risk_result() -> None:
    service = build_service()
    features = FeatureBuilder().build_from_live(LiveOrderStateFactory(), {"driver_on_time_rate": 0.9})

    result = service.predict("order-1", features)

    assert isinstance(result, PredictionResult)
    assert result.order_id == "order-1"
    assert result.is_high_risk is True
    assert result.risk_score == pytest.approx(0.84)
    # New proportional formula: (risk_score - threshold) / (1.0 - threshold) * 60
    # For score=0.84, threshold=0.7: (0.14 / 0.30) * 60 = 28.0
    assert result.predicted_delay_minutes == pytest.approx(28.0, abs=0.5)
    assert result.confidence == "high"
    assert result.model_version == "2024-01-01"
    assert result.inference_latency_ms >= 0


def test_predict_rejects_invalid_features() -> None:
    service = build_service(score=0.2)

    with pytest.raises(ValueError, match="Invalid features for order order-1"):
        service.predict("order-1", {"stops_remaining_ratio": 0.5})


def test_predict_with_shap_returns_sorted_factors() -> None:
    service = build_service()
    features = FeatureBuilder().build_from_live(LiveOrderStateFactory(), {"driver_on_time_rate": 0.9})

    result = service.predict_with_shap("order-2", features)

    assert result.is_high_risk is True
    assert len(result.top_risk_factors) == 5
    contributions = [factor["contribution"] for factor in result.top_risk_factors]
    assert contributions == sorted(contributions, reverse=True)
    assert any(factor["direction"] == "increases_risk" for factor in result.top_risk_factors)


def test_extract_top_factors_handles_top_k() -> None:
    service = build_service()
    features = FeatureBuilder().build_from_live(LiveOrderStateFactory(), {"driver_on_time_rate": 0.9})
    shap_values = np.array([0.9, -0.8, 0.7, 0.6, -0.5, 0.4, 0.3, 0.2, 0.1, 0.05, 0.04, 0.03, -0.02, -0.01])

    factors = service._extract_top_factors(shap_values, features, top_k=3)

    assert len(factors) == 3
    assert factors[0]["contribution"] >= factors[1]["contribution"] >= factors[2]["contribution"]
