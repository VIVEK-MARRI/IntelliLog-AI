"""
Prometheus metrics for continuous learning pipeline monitoring.
"""

import logging
from datetime import datetime, timedelta

from prometheus_client import Gauge, Counter, Histogram
from sqlalchemy.orm import Session

from src.backend.app.db.models import (
    ModelRegistry,
    DriftEvent,
    ModelTrainingLog,
    DeliveryFeedback,
)

logger = logging.getLogger(__name__)

# Metrics
model_age_hours = Gauge(
    "model_age_hours",
    "Hours since last successful model deployment",
    ["tenant_id"],
)

prediction_mae_7day = Gauge(
    "prediction_mae_7day",
    "Rolling 7-day Mean Absolute Error of predictions",
    ["tenant_id"],
)

drift_score = Gauge(
    "drift_score",
    "Data drift KS statistic per feature",
    ["tenant_id", "feature"],
)

retraining_success_rate = Gauge(
    "retraining_success_rate",
    "Fraction of retraining runs that produced improvement",
    ["tenant_id"],
)

model_performance_improvement = Gauge(
    "model_performance_improvement",
    "Percentage improvement of latest model vs previous",
    ["tenant_id"],
)

retraining_duration_seconds = Histogram(
    "retraining_duration_seconds",
    "Duration of retraining in seconds",
    ["tenant_id"],
)

retraining_samples = Gauge(
    "retraining_samples",
    "Number of samples used in latest retraining",
    ["tenant_id"],
)

data_quality_score = Gauge(
    "data_quality_score",
    "Data quality score (0-1) for latest retraining",
    ["tenant_id"],
)

drift_events_total = Counter(
    "drift_events_total",
    "Total number of drift events detected",
    ["tenant_id", "severity"],
)

predictions_total = Counter(
    "predictions_total",
    "Total predictions made",
    ["tenant_id"],
)

ab_test_traffic_ratio = Gauge(
    "ab_test_traffic_ratio",
    "Traffic split ratio for A/B test (0.0-1.0 for staging model)",
    ["tenant_id"],
)

production_model_accuracy = Gauge(
    "production_model_accuracy",
    "Accuracy of production model on recent data",
    ["tenant_id"],
)

# Traffic-specific metrics
traffic_api_failure_rate = Gauge(
    "traffic_api_failure_rate",
    "Failure rate of traffic API calls (%)",
    ["api_provider"],
)

traffic_cache_hit_rate = Gauge(
    "traffic_cache_hit_rate",
    "Cache hit rate for traffic data (%)",
    ["cache_type"],
)

traffic_ratio_by_hour = Gauge(
    "traffic_ratio_by_hour",
    "Average traffic ratio by hour of day (1.0 = free flow)",
    ["hour"],
)

traffic_features_importance = Gauge(
    "traffic_features_importance",
    "Importance score of traffic features in ML model",
    ["feature"],
)

traffic_api_cost_total = Counter(
    "continuous_learning_traffic_api_cost_usd",
    "Total cost of traffic API calls in USD",
    ["api_provider"],
)

traffic_api_latency_seconds = Histogram(
    "traffic_api_latency_seconds",
    "Latency of traffic API calls in seconds",
    ["api_provider"],
)


class MetricsCollector:
    """Collect and update metrics from database."""

    def __init__(self, db_session: Session):
        """Initialize metrics collector."""
        self.db = db_session

    def update_all_metrics(self, tenant_id: str = None) -> None:
        """Update all metrics for a tenant or all tenants."""
        try:
            if tenant_id:
                self._update_tenant_metrics(tenant_id)
            else:
                # Update for all tenants
                from src.backend.app.db.models import Tenant

                tenants = self.db.query(Tenant).all()
                for tenant in tenants:
                    self._update_tenant_metrics(tenant.id)

        except Exception as e:
            logger.error(f"Error updating metrics: {e}")

    def _update_tenant_metrics(self, tenant_id: str) -> None:
        """Update all metrics for a specific tenant."""
        try:
            # Model age
            self._update_model_age(tenant_id)

            # Model performance
            self._update_model_performance(tenant_id)

            # Data quality
            self._update_data_quality(tenant_id)

            # Retraining success rate
            self._update_retraining_success_rate(tenant_id)

            # Drift events
            self._update_drift_events(tenant_id)

            # Production model accuracy
            self._update_production_accuracy(tenant_id)

            # Traffic-aware metrics
            self._update_traffic_feature_importance(tenant_id)

        except Exception as e:
            logger.error(f"Error updating metrics for {tenant_id}: {e}")

    def _update_model_age(self, tenant_id: str) -> None:
        """Update model_age_hours metric."""
        try:
            prod_model = self.db.query(ModelRegistry).filter(
                ModelRegistry.tenant_id == tenant_id,
                ModelRegistry.stage == "production",
            ).order_by(ModelRegistry.deployment_time.desc()).first()

            if prod_model and prod_model.deployment_time:
                age_seconds = (datetime.utcnow() - prod_model.deployment_time).total_seconds()
                age_hours = age_seconds / 3600
                model_age_hours.labels(tenant_id=tenant_id).set(age_hours)
            else:
                model_age_hours.labels(tenant_id=tenant_id).set(-1)

        except Exception as e:
            logger.error(f"Error updating model age: {e}")

    def _update_model_performance(self, tenant_id: str) -> None:
        """Update model performance metrics."""
        try:
            # Get latest and previous production models
            models = self.db.query(ModelRegistry).filter(
                ModelRegistry.tenant_id == tenant_id,
                ModelRegistry.stage == "production",
            ).order_by(ModelRegistry.deployment_time.desc()).limit(2).all()

            if len(models) >= 2:
                latest = models[0]
                previous = models[1]

                if latest.mae_test and previous.mae_test:
                    improvement = (previous.mae_test - latest.mae_test) / previous.mae_test
                    model_performance_improvement.labels(tenant_id=tenant_id).set(
                        improvement * 100
                    )

        except Exception as e:
            logger.error(f"Error updating model performance: {e}")

    def _update_data_quality(self, tenant_id: str) -> None:
        """Update data quality metric from latest retraining."""
        try:
            latest_log = self.db.query(ModelTrainingLog).filter(
                ModelTrainingLog.tenant_id == tenant_id,
                ModelTrainingLog.status == "success",
            ).order_by(ModelTrainingLog.completed_at.desc()).first()

            if latest_log and latest_log.data_quality_score is not None:
                data_quality_score.labels(tenant_id=tenant_id).set(
                    latest_log.data_quality_score
                )

        except Exception as e:
            logger.error(f"Error updating data quality: {e}")

    def _update_retraining_success_rate(self, tenant_id: str) -> None:
        """Update retraining success rate metric."""
        try:
            # Get last 30 days of retraining runs
            cutoff = datetime.utcnow() - timedelta(days=30)

            total = self.db.query(ModelTrainingLog).filter(
                ModelTrainingLog.tenant_id == tenant_id,
                ModelTrainingLog.created_at >= cutoff,
            ).count()

            if total == 0:
                retraining_success_rate.labels(tenant_id=tenant_id).set(0)
                return

            success = self.db.query(ModelTrainingLog).filter(
                ModelTrainingLog.tenant_id == tenant_id,
                ModelTrainingLog.created_at >= cutoff,
                ModelTrainingLog.status == "success",
            ).count()

            rate = success / total if total > 0 else 0
            retraining_success_rate.labels(tenant_id=tenant_id).set(rate)

        except Exception as e:
            logger.error(f"Error updating retraining success rate: {e}")

    def _update_drift_events(self, tenant_id: str) -> None:
        """Update drift events metrics."""
        try:
            # Get drift events from last 7 days
            cutoff = datetime.utcnow() - timedelta(days=7)

            events = self.db.query(DriftEvent).filter(
                DriftEvent.tenant_id == tenant_id,
                DriftEvent.created_at >= cutoff,
            ).all()

            # Reset counters and update
            for severity in ["low", "medium", "high"]:
                count = sum(1 for e in events if e.severity == severity)
                drift_events_total.labels(tenant_id=tenant_id, severity=severity)._value.set(count)

            # Per-feature drift scores
            for event in events:
                drift_score.labels(tenant_id=tenant_id, feature=event.feature_name).set(
                    event.ks_statistic
                )

        except Exception as e:
            logger.error(f"Error updating drift events: {e}")

    def _update_production_accuracy(self, tenant_id: str) -> None:
        """Update production model accuracy on recent data."""
        try:
            cutoff = datetime.utcnow() - timedelta(days=7)

            records = self.db.query(DeliveryFeedback).filter(
                DeliveryFeedback.tenant_id == tenant_id,
                DeliveryFeedback.created_at >= cutoff,
                DeliveryFeedback.error_min.isnot(None),
            ).all()

            if not records:
                production_model_accuracy.labels(tenant_id=tenant_id).set(0)
                return

            # Accuracy = percent within 15 minutes
            within_15 = sum(1 for r in records if abs(r.error_min) <= 15)
            accuracy = (within_15 / len(records)) * 100

            production_model_accuracy.labels(tenant_id=tenant_id).set(accuracy)

        except Exception as e:
            logger.error(f"Error updating production accuracy: {e}")

    def _update_traffic_feature_importance(self, tenant_id: str) -> None:
        """Update traffic feature importance metrics from latest model."""
        try:
            # Get latest training log for tenant
            latest_log = self.db.query(ModelTrainingLog).filter(
                ModelTrainingLog.tenant_id == tenant_id,
                ModelTrainingLog.status == "success",
            ).order_by(ModelTrainingLog.completed_at.desc()).first()

            if not latest_log:
                return

            # Default importance scores for traffic features
            # In production, these would come from SHAP/feature importance analysis
            traffic_features_importance_scores = {
                "current_traffic_ratio": 0.12,
                "historical_avg_traffic_same_hour": 0.08,
                "historical_std_traffic_same_hour": 0.04,
                "is_peak_hour": 0.06,
                "weather_severity": 0.03,
                "effective_travel_time_min": 0.10,
            }

            for feature, importance in traffic_features_importance_scores.items():
                traffic_features_importance.labels(feature=feature).set(importance)

            logger.debug(f"Updated traffic feature importance for {tenant_id}")

        except Exception as e:
            logger.error(f"Error updating traffic feature importance: {e}")

    def update_traffic_api_metrics(
        self, api_provider: str, success_rate: float, latency_seconds: float, cost_usd: float = 0.0
    ) -> None:
        """Update metrics for traffic API performance."""
        try:
            failure_rate = (1 - success_rate) * 100
            traffic_api_failure_rate.labels(api_provider=api_provider).set(failure_rate)
            traffic_api_latency_seconds.labels(api_provider=api_provider).observe(latency_seconds)

            if cost_usd > 0:
                traffic_api_cost_total.labels(api_provider=api_provider).inc(cost_usd)

            logger.debug(
                f"Updated traffic API metrics for {api_provider}: "
                f"failure_rate={failure_rate:.1f}%, latency={latency_seconds:.3f}s"
            )

        except Exception as e:
            logger.error(f"Error updating traffic API metrics: {e}")

    def update_traffic_cache_metrics(self, cache_type: str, hit_rate: float) -> None:
        """Update cache efficiency metrics."""
        try:
            hit_rate_pct = hit_rate * 100
            traffic_cache_hit_rate.labels(cache_type=cache_type).set(hit_rate_pct)

            if hit_rate_pct < 70:
                logger.warning(f"Low cache hit rate for {cache_type}: {hit_rate_pct:.1f}%")

            logger.debug(f"Updated cache metrics for {cache_type}: hit_rate={hit_rate_pct:.1f}%")

        except Exception as e:
            logger.error(f"Error updating cache metrics: {e}")

    def update_traffic_ratio_by_hour(self, hour: int, avg_ratio: float) -> None:
        """Update traffic ratio gauge for specific hour."""
        try:
            if 0 <= hour < 24:
                traffic_ratio_by_hour.labels(hour=str(hour)).set(avg_ratio)
                logger.debug(f"Updated traffic ratio for hour {hour}: {avg_ratio:.2f}")

        except Exception as e:
            logger.error(f"Error updating traffic ratio by hour: {e}")
