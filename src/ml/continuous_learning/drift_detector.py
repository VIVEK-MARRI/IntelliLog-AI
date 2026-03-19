"""
Data drift detection for continuous learning pipeline.
Detects distribution shift in model features using statistical tests.
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional, Any

import numpy as np
import pandas as pd
from scipy import stats
from sqlalchemy.orm import Session

from src.backend.app.db.models import (
    DeliveryFeedback,
    DriftEvent,
    ModelRegistry,
    Tenant,
)
from src.backend.app.core.config import settings

logger = logging.getLogger(__name__)

# KS test p-value threshold for statistical significance
KS_P_VALUE_THRESHOLD = 0.05
# MAE degradation threshold for triggering emergency retrain
MAE_DEGRADATION_THRESHOLD = 0.15  # 15%


class DriftDetector:
    """Detect data drift and performance degradation."""

    def __init__(self, db_session: Session):
        """Initialize drift detector."""
        self.db = db_session

    def detect_drift(self, tenant_id: str) -> Dict[str, Any]:
        """
        Detect data drift for a tenant over past 7 days.

        Args:
            tenant_id: Tenant ID to check

        Returns:
            Dict with drift_detected (bool), features_with_drift (List[str]),
            severity (str: low/medium/high), mae_degradation_pct, events_created (int)
        """
        try:
            logger.info(f"Starting drift detection for tenant {tenant_id}")

            # Fetch 7-day recent data
            recent_data = self._fetch_recent_feedback(tenant_id, lookback_days=7)
            if recent_data.empty:
                logger.warning(f"No recent data for tenant {tenant_id}, skipping drift detection")
                return {
                    "drift_detected": False,
                    "features_with_drift": [],
                    "severity": "none",
                    "mae_degradation_pct": 0,
                    "events_created": 0,
                }

            # Fetch training data distribution (stored as JSON in MLflow)
            training_stats = self._fetch_training_distribution(tenant_id)
            if not training_stats:
                logger.warning(f"No training distribution for tenant {tenant_id}")
                return {
                    "drift_detected": False,
                    "features_with_drift": [],
                    "severity": "none",
                    "mae_degradation_pct": 0,
                    "events_created": 0,
                }

            # Test each feature for drift
            features_to_test = ["distance_km", "time_of_day", "traffic_condition"]
            drift_features = []
            drift_events = []

            for feature in features_to_test:
                if feature not in recent_data.columns:
                    continue

                is_drift, ks_stat, p_value, severity = self._test_feature_drift(
                    feature, recent_data, training_stats
                )

                if is_drift:
                    drift_features.append(feature)
                    training_mean = training_stats.get(f"{feature}_mean")
                    recent_mean = recent_data[feature].mean()

                    event = DriftEvent(
                        tenant_id=tenant_id,
                        feature_name=feature,
                        ks_statistic=float(ks_stat),
                        p_value=float(p_value),
                        severity=severity,
                        training_mean=float(training_mean) if training_mean else None,
                        recent_mean=float(recent_mean),
                        description=f"Drift in {feature}: KS={ks_stat:.4f}, p={p_value:.4f}",
                    )
                    drift_events.append(event)

            # Compute performance degradation
            mae_degradation_pct = self._compute_performance_degradation(tenant_id, recent_data)

            # Determine overall severity
            overall_severity = "low"
            if len(drift_features) >= 2 or mae_degradation_pct > MAE_DEGRADATION_THRESHOLD:
                overall_severity = "high"
            elif len(drift_features) > 0 or mae_degradation_pct > MAE_DEGRADATION_THRESHOLD * 0.5:
                overall_severity = "medium"

            drift_detected = len(drift_features) > 0 or mae_degradation_pct > MAE_DEGRADATION_THRESHOLD

            # Save drift events
            events_created = self._save_drift_events(drift_events)

            logger.info(
                f"Drift detection for {tenant_id}: drift_detected={drift_detected}, "
                f"severity={overall_severity}, features={drift_features}, "
                f"mae_degradation={mae_degradation_pct:.2f}%"
            )

            return {
                "drift_detected": drift_detected,
                "features_with_drift": drift_features,
                "severity": overall_severity,
                "mae_degradation_pct": mae_degradation_pct,
                "events_created": events_created,
            }

        except Exception as e:
            logger.error(f"Error in drift detection for {tenant_id}: {e}")
            return {
                "drift_detected": False,
                "features_with_drift": [],
                "severity": "none",
                "mae_degradation_pct": 0,
                "events_created": 0,
                "error": str(e),
            }

    def _fetch_recent_feedback(
        self, tenant_id: str, lookback_days: int = 7
    ) -> pd.DataFrame:
        """Fetch delivery feedback from past N days."""
        cutoff_time = datetime.utcnow() - timedelta(days=lookback_days)

        query = self.db.query(DeliveryFeedback).filter(
            DeliveryFeedback.tenant_id == tenant_id,
            DeliveryFeedback.created_at >= cutoff_time,
            DeliveryFeedback.actual_delivery_min.isnot(None),
        )

        records = query.all()
        if not records:
            return pd.DataFrame()

        data = [
            {
                "distance_km": r.distance_km,
                "time_of_day": r.time_of_day,
                "traffic_condition": r.traffic_condition,
                "weather": r.weather,
                "error_min": r.error_min,
                "predicted_eta_min": r.predicted_eta_min,
                "actual_delivery_min": r.actual_delivery_min,
            }
            for r in records
        ]

        return pd.DataFrame(data)

    def _fetch_training_distribution(self, tenant_id: str) -> Optional[Dict[str, float]]:
        """
        Fetch training data distribution statistics.
        In production, these would be stored in MLflow artifact.
        For now, we compute from production model's test set metadata.
        """
        # Try to get from model registry
        prod_model = self.db.query(ModelRegistry).filter(
            ModelRegistry.tenant_id == tenant_id,
            ModelRegistry.stage == "production",
        ).order_by(ModelRegistry.created_at.desc()).first()

        if not prod_model:
            return None

        # In real implementation, fetch from MLflow artifact
        # For now, return None to indicate need to fetch from MLflow
        # This is a placeholder for:
        # - mlflow.artifacts.download_artifacts(prod_model.mlflow_run_id, "training_distribution.json")
        return None

    def _test_feature_drift(
        self,
        feature: str,
        recent_data: pd.DataFrame,
        training_stats: Dict[str, float],
    ) -> Tuple[bool, float, float, str]:
        """
        Test feature for drift using KS test.

        Returns:
            Tuple of (is_drift: bool, ks_statistic: float, p_value: float, severity: str)
        """
        try:
            # Skip if feature missing
            if feature not in recent_data.columns:
                return False, 0, 1.0, "none"

            recent_values = recent_data[feature].dropna()
            if len(recent_values) < 10:
                return False, 0, 1.0, "none"

            # For categorical features, use chi-square test
            if feature == "traffic_condition" or feature == "time_of_day":
                # Use empirical distribution for comparison
                # This is simplified; in production, fetch actual training distribution
                return self._test_categorical_drift(feature, recent_values)

            # For numeric features, use KS test
            # Use recent_values as both distributions for now (placeholder)
            # In production: use training_stats[feature + "_dist"]
            if len(recent_values) > 1:
                # Generate synthetic training distribution for comparison
                # This should be replaced with actual training distribution
                synthetic_training = np.random.normal(
                    recent_values.mean(), recent_values.std(), size=1000
                )
                ks_stat, p_value = stats.ks_2samp(recent_values, synthetic_training)
            else:
                return False, 0, 1.0, "none"

            is_drift = p_value < KS_P_VALUE_THRESHOLD
            severity = "high" if is_drift and p_value < 0.01 else "medium" if is_drift else "low"

            return is_drift, ks_stat, p_value, severity

        except Exception as e:
            logger.error(f"Error testing drift for {feature}: {e}")
            return False, 0, 1.0, "none"

    def _test_categorical_drift(self, feature: str, recent_values) -> Tuple[bool, float, float, str]:
        """Test categorical feature for drift."""
        try:
            # Count frequencies
            value_counts = recent_values.value_counts()
            if len(value_counts) < 2:
                return False, 0, 1.0, "none"

            # Simple chi-square goodness of fit
            # Assuming uniform expected distribution
            observed = value_counts.values
            expected = np.ones(len(observed)) * (observed.sum() / len(observed))

            chi2, p_value = stats.chisquare(observed, expected)

            is_drift = p_value < KS_P_VALUE_THRESHOLD
            severity = "high" if is_drift and p_value < 0.01 else "medium" if is_drift else "low"

            return is_drift, chi2, p_value, severity

        except Exception as e:
            logger.error(f"Error testing categorical drift for {feature}: {e}")
            return False, 0, 1.0, "none"

    def _compute_performance_degradation(
        self, tenant_id: str, recent_data: pd.DataFrame
    ) -> float:
        """
        Compute MAE degradation vs baseline (production model).

        Returns:
            Degradation as percentage (0-100)
        """
        try:
            # Get production model MAE
            prod_model = self.db.query(ModelRegistry).filter(
                ModelRegistry.tenant_id == tenant_id,
                ModelRegistry.stage == "production",
            ).order_by(ModelRegistry.created_at.desc()).first()

            if not prod_model or not prod_model.mae_test:
                return 0

            baseline_mae = prod_model.mae_test

            # Compute current MAE
            if "error_min" not in recent_data.columns:
                return 0

            current_mae = recent_data["error_min"].abs().mean()

            # Degradation percentage
            degradation_pct = ((current_mae - baseline_mae) / baseline_mae) * 100

            return max(0, degradation_pct)

        except Exception as e:
            logger.error(f"Error computing performance degradation: {e}")
            return 0

    def _save_drift_events(self, drift_events: List[DriftEvent]) -> int:
        """Save drift events to database."""
        try:
            for event in drift_events:
                self.db.add(event)

            self.db.commit()
            logger.info(f"Saved {len(drift_events)} drift events")
            return len(drift_events)

        except Exception as e:
            logger.error(f"Error saving drift events: {e}")
            self.db.rollback()
            return 0

    def detect_drift_for_all_tenants(self) -> Dict[str, Any]:
        """
        Run drift detection for all active tenants.

        Returns:
            Dict with per-tenant results
        """
        try:
            tenants = self.db.query(Tenant).all()
            results = {}

            for tenant in tenants:
                result = self.detect_drift(tenant.id)
                results[tenant.id] = result

            logger.info(f"Drift detection completed for {len(tenants)} tenants")
            return results

        except Exception as e:
            logger.error(f"Error in drift detection for all tenants: {e}")
            return {}
