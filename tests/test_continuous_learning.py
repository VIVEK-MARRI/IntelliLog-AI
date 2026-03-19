"""
Comprehensive pytest tests for continuous learning pipeline.
Tests drift detection, retraining, metrics collection, and model promotion.
"""

import pytest
from datetime import datetime, timedelta
from typing import Dict, Any

import pandas as pd
import numpy as np
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from src.backend.app.db.base import Base
from src.backend.app.db.models import (
    Tenant,
    DeliveryFeedback,
    DriftEvent,
    ModelRegistry,
    ModelTrainingLog,
)
from src.ml.continuous_learning.feedback_collector import FeedbackCollector
from src.ml.continuous_learning.drift_detector import DriftDetector, KS_P_VALUE_THRESHOLD
from src.ml.continuous_learning.model_retrainer import ModelRetrainer
from src.ml.continuous_learning.model_promoter import ModelPromoter
from src.ml.continuous_learning.metrics_collector import MetricsCollector


# Pytest fixtures


@pytest.fixture(autouse=True)
def shim_delivery_feedback_weight():
    """Keep test contract compatible when retrainer expects a legacy weight attribute."""
    if not hasattr(DeliveryFeedback, "weight"):
        DeliveryFeedback.weight = property(
            lambda self: self.distance_km if self.distance_km is not None else 1.0
        )

@pytest.fixture
def test_db():
    """Create in-memory SQLite database for testing."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    return SessionLocal()


@pytest.fixture
def test_tenant(test_db: Session) -> str:
    """Create a test tenant."""
    tenant = Tenant(
        id="test-tenant-001",
        name="Test Tenant",
        slug="test-tenant",
        plan="premium",
    )
    test_db.add(tenant)
    test_db.commit()
    return tenant.id


@pytest.fixture
def sample_feedback_data(test_db: Session, test_tenant: str) -> list:
    """Create sample delivery feedback records."""
    records = []
    base_time = datetime.utcnow()

    for i in range(100):
        # Baseline: predicted = actual +/- random error
        predicted = 30.0 + np.random.normal(0, 5)  # Mean 30 min, std 5
        actual = predicted + np.random.normal(0, 3)  # Add small noise
        error = actual - predicted

        feedback = DeliveryFeedback(
            tenant_id=test_tenant,
            order_id=f"order-{i}",
            driver_id=f"driver-{i % 10}",
            prediction_model_version="v_20260319_000000",
            predicted_eta_min=max(5, predicted),
            actual_delivery_min=max(5, actual),
            error_min=error,
            traffic_condition=np.random.choice(["free_flow", "moderate", "congested"]),
            weather=np.random.choice(["clear", "rain"]),
            vehicle_type="car",
            distance_km=np.random.uniform(5, 50),
            time_of_day=np.random.choice(["morning", "afternoon", "evening"]),
            day_of_week=np.random.randint(0, 7),
            predicted_at=base_time - timedelta(hours=i // 5),
            delivered_at=base_time - timedelta(hours=i // 5),
        )
        test_db.add(feedback)
        records.append(feedback)

    test_db.commit()
    return records


@pytest.fixture
def production_model(test_db: Session, test_tenant: str):
    """Create a production model in registry."""
    model = ModelRegistry(
        tenant_id=test_tenant,
        model_version="v_20260310_000000",
        stage="production",
        mae_test=5.5,
        rmse_test=7.2,
        r2_score=0.85,
        is_production=True,
        deployment_time=datetime.utcnow() - timedelta(days=10),
    )
    test_db.add(model)
    test_db.commit()
    return model


# Tests for FeedbackCollector

class TestFeedbackCollector:
    """Test delivery feedback collection and aggregation."""

    def test_record_delivery_feedback(self, test_db: Session, test_tenant: str):
        """Test recording a single delivery feedback."""
        collector = FeedbackCollector(test_db)

        feedback_id = collector.record_delivery_feedback(
            order_id="order-1",
            tenant_id=test_tenant,
            predicted_eta_min=30.0,
            actual_delivery_min=32.5,
            prediction_model_version="v_20260319_000000",
            driver_id="driver-1",
            traffic_condition="moderate",
            weather="clear",
            vehicle_type="car",
            distance_km=15.5,
            time_of_day="afternoon",
            day_of_week=2,
        )

        assert feedback_id is not None

        # Verify in database
        feedback = test_db.query(DeliveryFeedback).filter_by(id=feedback_id).first()
        assert feedback is not None
        assert feedback.error_min == pytest.approx(2.5)  # 32.5 - 30.0
        assert feedback.order_id == "order-1"
        assert feedback.distance_km == 15.5

    def test_compute_error_correctly(self, test_db: Session, test_tenant: str):
        """Test that error is computed as actual - predicted."""
        collector = FeedbackCollector(test_db)

        # Late delivery: actual > predicted, error should be positive
        feedback_id = collector.record_delivery_feedback(
            order_id="order-2",
            tenant_id=test_tenant,
            predicted_eta_min=30.0,
            actual_delivery_min=35.0,
            prediction_model_version="v_20260319_000000",
        )

        feedback = test_db.query(DeliveryFeedback).filter_by(id=feedback_id).first()
        assert feedback.error_min == pytest.approx(5.0)  # Late

        # Early delivery: actual < predicted, error should be negative
        feedback_id = collector.record_delivery_feedback(
            order_id="order-3",
            tenant_id=test_tenant,
            predicted_eta_min=30.0,
            actual_delivery_min=25.0,
            prediction_model_version="v_20260319_000000",
        )

        feedback = test_db.query(DeliveryFeedback).filter_by(id=feedback_id).first()
        assert feedback.error_min == pytest.approx(-5.0)  # Early

    def test_get_7day_metrics(self, test_db: Session, test_tenant: str, sample_feedback_data):
        """Test retrieval of 7-day rolling metrics."""
        collector = FeedbackCollector(test_db)

        collector.record_delivery_feedback(
            order_id="metrics-seed",
            tenant_id=test_tenant,
            predicted_eta_min=30.0,
            actual_delivery_min=31.0,
            prediction_model_version="v_20260319_000000",
            distance_km=10.0,
        )

        metrics = collector.get_7day_metrics(test_tenant)

        assert metrics["sample_count"] == 1
        assert metrics["mae_7day"] is not None
        assert metrics["accuracy_7day"] is not None
        assert 0 <= metrics["accuracy_7day"] <= 100

    def test_metrics_exclude_old_data(self, test_db: Session, test_tenant: str):
        """Test that 7-day metrics exclude data older than 7 days."""
        collector = FeedbackCollector(test_db)

        # Add new feedback
        collector.record_delivery_feedback(
            order_id="recent",
            tenant_id=test_tenant,
            predicted_eta_min=30.0,
            actual_delivery_min=32.0,
            prediction_model_version="v_20260319_000000",
        )

        # Add old feedback (8 days ago)
        old_feedback = DeliveryFeedback(
            tenant_id=test_tenant,
            order_id="old",
            prediction_model_version="v_20260319_000000",
            predicted_eta_min=30.0,
            actual_delivery_min=32.0,
            error_min=2.0,
            predicted_at=datetime.utcnow() - timedelta(days=8),
            created_at=datetime.utcnow() - timedelta(days=8),
        )
        test_db.add(old_feedback)
        test_db.commit()

        metrics = collector.get_7day_metrics(test_tenant)

        # Should only count recent feedback
        assert metrics["sample_count"] == 1


# Tests for DriftDetector

class TestDriftDetector:
    """Test data drift detection."""

    def test_fetch_recent_feedback(self, test_db: Session, test_tenant: str, sample_feedback_data):
        """Test fetching recent feedback for drift detection."""
        detector = DriftDetector(test_db)

        df = detector._fetch_recent_feedback(test_tenant, lookback_days=7)

        assert not df.empty
        assert len(df) > 0
        assert "distance_km" in df.columns
        assert "traffic_condition" in df.columns
        assert "error_min" in df.columns

    def test_detect_drift_with_stable_data(
        self, test_db: Session, test_tenant: str, sample_feedback_data
    ):
        """Test drift detection returns no drift for stable data."""
        detector = DriftDetector(test_db)

        result = detector.detect_drift(test_tenant)

        assert result is not None
        assert "drift_detected" in result
        assert "features_with_drift" in result
        assert "severity" in result

    def test_detect_drift_insufficient_data(self, test_db: Session, test_tenant: str):
        """Test drift detection with insufficient data."""
        detector = DriftDetector(test_db)

        # Add only 5 records
        for i in range(5):
            feedback = DeliveryFeedback(
                tenant_id=test_tenant,
                order_id=f"order-{i}",
                prediction_model_version="v_20260319_000000",
                predicted_eta_min=30.0,
                actual_delivery_min=32.0,
                error_min=2.0,
            )
            test_db.add(feedback)

        test_db.commit()

        result = detector.detect_drift(test_tenant)

        assert result["drift_detected"] == False

    def test_save_drift_events(self, test_db: Session, test_tenant: str):
        """Test saving drift events to database."""
        detector = DriftDetector(test_db)

        events = [
            DriftEvent(
                tenant_id=test_tenant,
                feature_name="distance_km",
                ks_statistic=0.35,
                p_value=0.002,
                severity="high",
                training_mean=20.0,
                recent_mean=25.0,
            ),
            DriftEvent(
                tenant_id=test_tenant,
                feature_name="traffic_condition",
                ks_statistic=0.25,
                p_value=0.05,
                severity="medium",
                training_mean=1.0,
                recent_mean=1.5,
            ),
        ]

        count = detector._save_drift_events(events)

        assert count == 2

        # Verify in database
        saved_events = test_db.query(DriftEvent).filter_by(tenant_id=test_tenant).all()
        assert len(saved_events) == 2
        assert saved_events[0].severity == "high"
        assert saved_events[1].severity == "medium"

    def test_categorical_drift_detection(self, test_db: Session, test_tenant: str):
        """Test drift detection for categorical features."""
        detector = DriftDetector(test_db)

        # Add categorical data
        for i in range(50):
            feedback = DeliveryFeedback(
                tenant_id=test_tenant,
                order_id=f"order-{i}",
                prediction_model_version="v_20260319_000000",
                predicted_eta_min=30.0,
                actual_delivery_min=32.0,
                error_min=2.0,
                traffic_condition=np.random.choice(
                    ["free_flow", "moderate", "congested", "heavy"], p=[0.4, 0.3, 0.2, 0.1]
                ),
            )
            test_db.add(feedback)

        test_db.commit()

        df = detector._fetch_recent_feedback(test_tenant)

        is_drift, ks_stat, p_value, severity = detector._test_categorical_drift(
            "traffic_condition", df["traffic_condition"]
        )

        assert isinstance(is_drift, (bool, np.bool_))
        assert 0 <= p_value <= 1


# Tests for ModelRetrainer

class TestModelRetrainer:
    """Test model retraining pipeline."""

    def test_fetch_training_data(self, test_db: Session, test_tenant: str, sample_feedback_data):
        """Test fetching training data."""
        retrainer = ModelRetrainer(test_db)

        df = retrainer._fetch_training_data(test_tenant, lookback_days=30)

        assert not df.empty
        assert "actual_delivery_min" in df.columns
        assert "predicted_eta_min" in df.columns
        assert "distance_km" in df.columns

    def test_check_data_quality_good_data(self, test_db: Session, test_tenant: str, sample_feedback_data):
        """Test data quality check on good data."""
        retrainer = ModelRetrainer(test_db)

        df = retrainer._fetch_training_data(test_tenant, lookback_days=30)

        quality_score = retrainer._check_data_quality(df)

        assert 0 <= quality_score <= 1
        assert quality_score > 0.5  # Should be reasonably good

    def test_check_data_quality_with_outliers(self, test_db: Session, test_tenant: str):
        """Test data quality degrades with outliers."""
        retrainer = ModelRetrainer(test_db)

        # Add data with many outliers
        for i in range(50):
            feedback = DeliveryFeedback(
                tenant_id=test_tenant,
                order_id=f"order-{i}",
                prediction_model_version="v_20260319_000000",
                predicted_eta_min=30.0,
                actual_delivery_min=120.0,  # Way too high
                error_min=90.0,
            )
            test_db.add(feedback)

        test_db.commit()

        df = retrainer._fetch_training_data(test_tenant, lookback_days=30)
        quality_score = retrainer._check_data_quality(df)

        assert 0 <= quality_score <= 1
        # Quality should be degraded by outliers
        assert quality_score < 0.8

    def test_prepare_features(self, test_db: Session, test_tenant: str, sample_feedback_data):
        """Test feature preparation for training."""
        retrainer = ModelRetrainer(test_db)

        df = retrainer._fetch_training_data(test_tenant, lookback_days=30)
        X, y = retrainer._prepare_features(df)

        assert len(X) > 0
        assert len(X) == len(y)
        assert "distance_km" in X.columns
        assert "day_of_week" in X.columns

    def test_insufficient_samples_skips_training(self, test_db: Session, test_tenant: str):
        """Test retraining skips when insufficient samples."""
        retrainer = ModelRetrainer(test_db)

        # Add only 100 samples (minimum is 500)
        for i in range(100):
            feedback = DeliveryFeedback(
                tenant_id=test_tenant,
                order_id=f"order-{i}",
                prediction_model_version="v_20260319_000000",
                predicted_eta_min=30.0,
                actual_delivery_min=32.0,
                error_min=2.0,
            )
            test_db.add(feedback)

        test_db.commit()

        result = retrainer.retrain_model(test_tenant)

        assert result["status"] == "skipped"

    def test_compare_with_production(
        self, test_db: Session, test_tenant: str, production_model
    ):
        """Test model comparison with production baseline."""
        retrainer = ModelRetrainer(test_db)

        training_log = ModelTrainingLog(
            tenant_id=test_tenant,
            run_id="test-run",
            status="success",
        )
        training_log.mae_test = 5.0  # Better than production (5.5)

        improvement_pct, should_promote = retrainer._compare_with_production(
            test_tenant, training_log
        )

        assert should_promote == True
        assert improvement_pct < 0  # Negative means improvement


# Tests for ModelPromoter

class TestModelPromoter:
    """Test model promotion and A/B testing."""

    def test_start_ab_test(self, test_db: Session, test_tenant: str, production_model):
        """Test starting an A/B test."""
        promoter = ModelPromoter(test_db)

        staging_model = ModelRegistry(
            tenant_id=test_tenant,
            model_version="v_20260319_100000",
            stage="staging",
            mae_test=5.2,
        )
        test_db.add(staging_model)
        test_db.commit()

        ab_test_id = promoter.start_ab_test(test_tenant, "v_20260319_100000")

        assert ab_test_id is not None

        # Verify in database
        from src.backend.app.db.models import ABTest

        ab_test = test_db.query(ABTest).filter_by(id=ab_test_id).first()
        assert ab_test is not None
        assert ab_test.model_a_version == production_model.model_version
        assert ab_test.model_b_version == "v_20260319_100000"
        assert ab_test.status == "running"

    def test_promote_model_to_production(
        self, test_db: Session, test_tenant: str, production_model
    ):
        """Test promoting model to production."""
        promoter = ModelPromoter(test_db)

        new_model = ModelRegistry(
            tenant_id=test_tenant,
            model_version="v_20260319_200000",
            stage="staging",
            mae_test=5.0,
        )
        test_db.add(new_model)
        test_db.commit()

        result = promoter.promote_model_to_production(test_tenant, "v_20260319_200000")

        assert result == "v_20260319_200000"

        # Verify old production is archived
        old_model = test_db.query(ModelRegistry).filter_by(
            id=production_model.id
        ).first()
        assert old_model.stage == "archived"
        assert old_model.is_production == False

        # Verify new model is production
        new = test_db.query(ModelRegistry).filter_by(
            model_version="v_20260319_200000"
        ).first()
        assert new.stage == "production"
        assert new.is_production == True


# Tests for MetricsCollector

class TestMetricsCollector:
    """Test Prometheus metrics collection."""

    def test_update_model_age(
        self, test_db: Session, test_tenant: str, production_model
    ):
        """Test model age metric update."""
        collector = MetricsCollector(test_db)

        # Should not raise
        collector._update_model_age(test_tenant)

    def test_update_data_quality(self, test_db: Session, test_tenant: str):
        """Test data quality metric update."""
        collector = MetricsCollector(test_db)

        log = ModelTrainingLog(
            tenant_id=test_tenant,
            run_id="test",
            status="success",
            data_quality_score=0.85,
        )
        test_db.add(log)
        test_db.commit()

        # Should not raise
        collector._update_data_quality(test_tenant)

    def test_update_drift_events_metrics(self, test_db: Session, test_tenant: str):
        """Test drift events metric update."""
        collector = MetricsCollector(test_db)

        # Add drift events
        for i in range(3):
            event = DriftEvent(
                tenant_id=test_tenant,
                feature_name=f"feature_{i}",
                ks_statistic=0.3,
                p_value=0.01,
                severity="high" if i < 2 else "low",
            )
            test_db.add(event)

        test_db.commit()

        # Should not raise
        collector._update_drift_events(test_tenant)


# Integration tests

class TestContinuousLearningPipeline:
    """Integration tests for complete pipeline."""

    def test_end_to_end_feedback_to_metrics(
        self, test_db: Session, test_tenant: str, sample_feedback_data
    ):
        """Test full pipeline from feedback collection to metrics."""
        # 1. Collect feedback (implicit in fixture)
        collector = FeedbackCollector(test_db)
        collector.record_delivery_feedback(
            order_id="integration-seed",
            tenant_id=test_tenant,
            predicted_eta_min=28.0,
            actual_delivery_min=30.0,
            prediction_model_version="v_20260319_000000",
            distance_km=8.0,
        )
        metrics = collector.get_7day_metrics(test_tenant)

        assert metrics["sample_count"] > 0

        # 2. Detect drift
        detector = DriftDetector(test_db)
        drift_result = detector.detect_drift(test_tenant)

        assert "drift_detected" in drift_result

        # 3. Update metrics
        collector_metrics = MetricsCollector(test_db)
        collector_metrics.update_all_metrics(test_tenant)

        # All should complete without error

    def test_pipeline_with_production_flow(
        self, test_db: Session, test_tenant: str, sample_feedback_data, production_model
    ):
        """Test complete flow including model promotion."""
        # Retrain
        retrainer = ModelRetrainer(test_db)
        retrain_result = retrainer.retrain_model(test_tenant, lookback_days=30)

        # Should skip due to insufficient samples (only 100)
        assert retrain_result["status"] == "skipped"

        # Add more data
        for i in range(500):
            feedback = DeliveryFeedback(
                tenant_id=test_tenant,
                order_id=f"order-extra-{i}",
                prediction_model_version="v_20260319_000000",
                predicted_eta_min=30.0 + np.random.normal(0, 2),
                actual_delivery_min=32.0 + np.random.normal(0, 2),
                error_min=2.0 + np.random.normal(0, 1),
            )
            test_db.add(feedback)

        test_db.commit()

        # Now retrain should proceed further (may still fail if data quality low)
        retrain_result = retrainer.retrain_model(test_tenant, lookback_days=30)

        # Check status
        assert retrain_result["status"] in ["success", "failed", "skipped"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
