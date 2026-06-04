"""
Tests for IntelliLog-AI ML pipeline.

Covers feature engineering, training, and inference.
"""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.ml.feature_engineering import FeatureBuilder, FeatureStats
from src.ml.inference import PredictionService


class TestFeatureEngineering:
    """Tests for feature engineering pipeline."""
    
    @pytest.fixture
    def builder(self) -> FeatureBuilder:
        """Create feature builder instance."""
        return FeatureBuilder()
    
    @pytest.fixture
    def sample_historical_row(self) -> pd.Series:
        """Sample historical delivery record."""
        return pd.Series({
            "order_id": "order-001",
            "planned_stops": 10,
            "actual_stops": 10,
            "completed_stops": 10,
            "planned_duration_minutes": 240.0,
            "actual_duration_minutes": 250.0,
            "avg_speed_kmh": 35.0,
            "stop_dwell_time_avg_minutes": 5.0,
            "driver_historical_on_time_rate": 0.85,
            "hour_of_day_start": 14,
            "day_of_week": 2,
            "distance_km": 150.0,
        })
    
    @pytest.fixture
    def sample_live_state(self) -> dict:
        """Sample live order state."""
        return {
            "order_id": "order-001",
            "planned_stops": 10,
            "completed_stops": 5,
            "planned_duration_minutes": 240.0,
            "actual_duration_so_far_minutes": 120.0,
            "stops_remaining": 5,
            "eta_minutes_remaining": 120.0,
            "speed": 35.0,
            "deviation_meters": 100.0,
            "hour_of_day": 14,
            "day_of_week": 2,
        }
    
    @pytest.fixture
    def sample_driver_stats(self) -> dict:
        """Sample driver statistics."""
        return {
            "driver_on_time_rate": 0.85,
        }
    
    def test_feature_names_list(self, builder: FeatureBuilder) -> None:
        """Test that get_feature_names returns correct feature list."""
        names = builder.get_feature_names()
        
        assert len(names) == 14
        assert "stops_remaining_ratio" in names
        assert "pace_ratio" in names
        assert "driver_on_time_rate" in names
        assert "hour_of_day_sin" in names
        assert "day_of_week_cos" in names
    
    def test_build_from_historical_no_nan(
        self,
        builder: FeatureBuilder,
        sample_historical_row: pd.Series,
    ) -> None:
        """Test that historical feature building produces no NaN values."""
        features = builder.build_from_historical(sample_historical_row)
        
        # Check all features present
        assert len(features) == 14
        
        # Check no NaN values
        for name, value in features.items():
            assert not pd.isna(value), f"Feature {name} is NaN"
            assert np.isfinite(value), f"Feature {name} is infinite"
    
    def test_build_from_live_no_nan(
        self,
        builder: FeatureBuilder,
        sample_live_state: dict,
        sample_driver_stats: dict,
    ) -> None:
        """Test that live feature building produces no NaN values."""
        features = builder.build_from_live(sample_live_state, sample_driver_stats)
        
        assert len(features) == 14
        
        for name, value in features.items():
            assert not pd.isna(value), f"Feature {name} is NaN"
            assert np.isfinite(value), f"Feature {name} is infinite"
    
    def test_feature_order_consistency(
        self,
        builder: FeatureBuilder,
        sample_historical_row: pd.Series,
        sample_live_state: dict,
        sample_driver_stats: dict,
    ) -> None:
        """Test that both methods return features in same order."""
        features_hist = builder.build_from_historical(sample_historical_row)
        features_live = builder.build_from_live(sample_live_state, sample_driver_stats)
        
        # Keys should be identical
        assert set(features_hist.keys()) == set(features_live.keys())
        
        # Order should be identical
        assert list(features_hist.keys()) == list(features_live.keys())
    
    def test_feature_ranges(
        self,
        builder: FeatureBuilder,
        sample_historical_row: pd.Series,
    ) -> None:
        """Test that features are in reasonable ranges."""
        features = builder.build_from_historical(sample_historical_row)
        
        # Ratio features should be 0-1 (mostly)
        assert 0 <= features["stops_remaining_ratio"] <= 1.5  # Allow >1 for error cases
        assert 0 <= features["time_elapsed_ratio"] <= 1.5
        assert features["avg_stop_dwell_minutes"] > 0
        
        # Speed should be positive
        assert features["current_speed_kmh"] >= 0
        
        # Driver OTR should be 0-1
        assert 0 <= features["driver_on_time_rate"] <= 1
        
        # Cyclic features should be -1 to 1
        assert -1 <= features["hour_of_day_sin"] <= 1
        assert -1 <= features["hour_of_day_cos"] <= 1
        assert -1 <= features["day_of_week_sin"] <= 1
        assert -1 <= features["day_of_week_cos"] <= 1
    
    def test_validate_features_valid(
        self,
        builder: FeatureBuilder,
        sample_historical_row: pd.Series,
    ) -> None:
        """Test that validation passes for valid features."""
        features = builder.build_from_historical(sample_historical_row)
        
        # Should not raise
        assert builder.validate_features(features)
    
    def test_validate_features_missing_raises(self, builder: FeatureBuilder) -> None:
        """Test that validation fails for missing features."""
        features = {"stops_remaining_ratio": 0.5}  # Missing most features
        
        with pytest.raises(ValueError, match="Missing feature"):
            builder.validate_features(features)
    
    def test_validate_features_nan_raises(self, builder: FeatureBuilder) -> None:
        """Test that validation fails for NaN values."""
        features = {name: np.nan for name in builder.get_feature_names()}
        
        with pytest.raises(ValueError, match="is NaN"):
            builder.validate_features(features)
    
    def test_compute_feature_stats(self) -> None:
        """Test feature stats computation from historical data."""
        # Create sample DataFrame
        df = pd.DataFrame({
            "planned_stops": [10, 10, 10],
            "actual_stops": [10, 10, 10],
            "completed_stops": [10, 10, 10],
            "planned_duration_minutes": [240.0, 240.0, 240.0],
            "actual_duration_minutes": [250.0, 240.0, 260.0],
            "avg_speed_kmh": [35.0, 40.0, 30.0],
            "stop_dwell_time_avg_minutes": [5.0, 5.0, 5.0],
            "driver_historical_on_time_rate": [0.85, 0.85, 0.85],
            "hour_of_day_start": [14, 14, 14],
            "day_of_week": [2, 2, 2],
            "distance_km": [150.0, 150.0, 150.0],
        })
        
        builder = FeatureBuilder()
        stats = builder.compute_feature_stats(df)
        
        # Check stats
        assert "stops_remaining_ratio" in stats.feature_medians
        assert len(stats.feature_medians) == 14
        assert len(stats.feature_mins) == 14
        assert len(stats.feature_maxs) == 14
    
    def test_impute_features(self) -> None:
        """Test feature imputation."""
        builder = FeatureBuilder()
        
        # Create stats
        stats = FeatureStats(
            feature_medians={name: 0.5 for name in builder.get_feature_names()},
            feature_mins={name: 0.0 for name in builder.get_feature_names()},
            feature_maxs={name: 1.0 for name in builder.get_feature_names()},
        )
        
        # Features with NaN
        features = {
            name: np.nan if i % 2 == 0 else 0.7
            for i, name in enumerate(builder.get_feature_names())
        }
        
        imputed = builder.impute_features(features, stats)
        
        # Check no NaN
        for value in imputed.values():
            assert not pd.isna(value)


class TestPredictionService:
    """Tests for inference service."""
    
    @pytest.fixture
    def service_models_exist(self) -> bool:
        """Check if model artifacts exist."""
        model_dir = Path("models")
        required_files = [
            "model.joblib",
            "feature_names.json",
            "optimal_threshold.json",
            "feature_stats.json",
            "training_metadata.json",
        ]
        return all((model_dir / f).exists() for f in required_files)
    
    @pytest.fixture
    def service(self, service_models_exist: bool) -> PredictionService | None:
        """Create inference service if models exist."""
        if not service_models_exist:
            return None
        try:
            return PredictionService(model_dir="models/")
        except (FileNotFoundError, ValueError):
            return None
    
    def test_service_initialization(self, service: PredictionService | None) -> None:
        """Test that service initializes successfully if models exist."""
        if service is None:
            pytest.skip("Model artifacts not found")
        
        assert service is not None
        assert service.model is not None
        assert len(service.feature_names) == 14
        assert 0 < service.optimal_threshold < 1
    
    def test_predict_returns_valid_result(
        self,
        service: PredictionService | None,
    ) -> None:
        """Test that predict returns valid PredictionResult."""
        if service is None:
            pytest.skip("Model artifacts not found")
        
        # Create features
        features = {name: 0.5 for name in service.feature_names}
        
        result = service.predict("test-order-001", features)
        
        # Check result structure
        assert result.order_id == "test-order-001"
        assert 0 <= result.risk_score <= 1
        assert isinstance(result.is_high_risk, bool)
        assert result.confidence in ["low", "medium", "high"]
        assert isinstance(result.top_risk_factors, list)
        assert result.predicted_delay_minutes >= 0
        assert result.model_version is not None
        assert result.inference_latency_ms > 0
    
    def test_predict_with_shap_explains_factors(
        self,
        service: PredictionService | None,
    ) -> None:
        """Test that predict_with_shap returns SHAP explanations."""
        if service is None:
            pytest.skip("Model artifacts not found")
        
        features = {name: 0.5 for name in service.feature_names}
        
        result = service.predict_with_shap("test-order-002", features)
        
        # Check SHAP factors
        assert len(result.top_risk_factors) > 0
        assert len(result.top_risk_factors) <= 5
        
        for factor in result.top_risk_factors:
            assert "feature" in factor
            assert "value" in factor
            assert "contribution" in factor
            assert "direction" in factor
            assert factor["direction"] in ["increases_risk", "decreases_risk", "neutral"]
    
    def test_predict_latency_under_50ms(
        self,
        service: PredictionService | None,
    ) -> None:
        """Test that inference latency is under 50ms."""
        if service is None:
            pytest.skip("Model artifacts not found")
        
        features = {name: 0.5 for name in service.feature_names}
        
        latencies = []
        for i in range(100):
            result = service.predict(f"test-order-{i}", features)
            latencies.append(result.inference_latency_ms)
        
        avg_latency = np.mean(latencies)
        p99_latency = np.percentile(latencies, 99)
        
        print(f"Average latency: {avg_latency:.2f}ms, P99: {p99_latency:.2f}ms")
        
        assert avg_latency < 50, f"Average latency {avg_latency:.2f}ms exceeds 50ms SLA"
        assert p99_latency < 100, f"P99 latency {p99_latency:.2f}ms exceeds 100ms SLA"
    
    def test_predict_invalid_features_raises(
        self,
        service: PredictionService | None,
    ) -> None:
        """Test that invalid features raise error."""
        if service is None:
            pytest.skip("Model artifacts not found")
        
        # Missing features
        features = {"stops_remaining_ratio": 0.5}
        
        with pytest.raises(ValueError):
            service.predict("test-order", features)
    
    def test_benchmark_latency(
        self,
        service: PredictionService | None,
    ) -> None:
        """Test inference speed benchmark."""
        if service is None:
            pytest.skip("Model artifacts not found")
        
        avg_latency = service.benchmark(n_predictions=100)
        
        assert avg_latency < 50


class TestModelQuality:
    """Tests for model quality metrics."""
    
    def test_model_beats_baseline(self) -> None:
        """Test that trained model F1 beats naive baseline."""
        metadata_path = Path("models/training_metadata.json")
        
        if not metadata_path.exists():
            pytest.skip("Training metadata not found (run training first)")
        
        with open(metadata_path) as f:
            metadata = json.load(f)
        
        f1_model = metadata["metrics"]["f1"]
        f1_baseline = metadata["f1_baseline"]
        
        print(f"Model F1: {f1_model:.4f}, Baseline F1: {f1_baseline:.4f}")
        
        assert f1_model > f1_baseline, \
            f"Model F1 ({f1_model:.4f}) does not beat baseline ({f1_baseline:.4f})"
    
    def test_model_metrics_reasonable(self) -> None:
        """Test that model metrics are in reasonable ranges."""
        metadata_path = Path("models/training_metadata.json")
        
        if not metadata_path.exists():
            pytest.skip("Training metadata not found")
        
        with open(metadata_path) as f:
            metadata = json.load(f)
        
        metrics = metadata["metrics"]
        
        # Check ranges
        assert 0 < metrics["f1"] < 1
        assert 0 < metrics["auc_roc"] < 1
        assert 0 < metrics["auc_pr"] < 1
        assert 0 <= metrics["precision"] <= 1
        assert 0 <= metrics["recall"] <= 1
        assert 0 <= metrics["brier_score"] <= 1
    
    def test_model_is_calibrated(self) -> None:
        """Test that model is well-calibrated (low Brier score)."""
        metadata_path = Path("models/training_metadata.json")
        
        if not metadata_path.exists():
            pytest.skip("Training metadata not found")
        
        with open(metadata_path) as f:
            metadata = json.load(f)
        
        brier = metadata["metrics"]["brier_score"]
        
        # Well-calibrated model should have Brier < 0.25 for imbalanced classification
        # (More lenient threshold for 21% positive class rate)
        assert brier < 0.25, \
            f"Model Brier score ({brier:.4f}) indicates poor calibration"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
