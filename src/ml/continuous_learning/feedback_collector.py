"""
Delivery feedback collection and metrics aggregation for continuous learning.
Triggered on DeliveryCompleted events.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

import redis
from sqlalchemy.orm import Session

from src.backend.app.db.models import DeliveryFeedback, DeliveryLog, Order, Driver
from src.backend.app.core.config import settings

logger = logging.getLogger(__name__)


class FeedbackCollector:
    """Collect delivery outcomes and update rolling metrics."""

    def __init__(self, db_session: Session):
        """Initialize feedback collector with DB session."""
        self.db = db_session
        try:
            self.redis_client = redis.from_url(settings.REDIS_FEATURE_STORE_URL)
            self.redis_client.ping()
            self._has_redis = True
        except Exception as e:
            logger.warning(f"Redis unavailable for metrics: {e}. Using in-memory fallback.")
            self._has_redis = False
            self.metrics_cache = {}

    def record_delivery_feedback(
        self,
        order_id: str,
        tenant_id: str,
        predicted_eta_min: float,
        actual_delivery_min: float,
        prediction_model_version: str,
        driver_id: Optional[str] = None,
        traffic_condition: Optional[str] = None,
        weather: Optional[str] = None,
        vehicle_type: Optional[str] = None,
        distance_km: Optional[float] = None,
        time_of_day: Optional[str] = None,
        day_of_week: Optional[int] = None,
    ) -> Optional[str]:
        """
        Record delivery feedback and update metrics.

        Args:
            order_id: Order ID
            tenant_id: Tenant ID
            predicted_eta_min: Predicted delivery time in minutes
            actual_delivery_min: Actual delivery time in minutes
            prediction_model_version: Model version used for prediction
            driver_id: Driver ID
            traffic_condition: free_flow, moderate, congested, heavy
            weather: clear, rain, snow, fog
            vehicle_type: car, van, truck
            distance_km: Distance in km
            time_of_day: morning, afternoon, evening, night
            day_of_week: 0=Monday, 6=Sunday

        Returns:
            Feedback ID if successful, None otherwise
        """
        try:
            # Compute error
            error_min = actual_delivery_min - predicted_eta_min

            # Create feedback record
            feedback = DeliveryFeedback(
                tenant_id=tenant_id,
                order_id=order_id,
                driver_id=driver_id,
                prediction_model_version=prediction_model_version,
                predicted_eta_min=predicted_eta_min,
                actual_delivery_min=actual_delivery_min,
                error_min=error_min,
                traffic_condition=traffic_condition,
                weather=weather,
                vehicle_type=vehicle_type,
                distance_km=distance_km,
                time_of_day=time_of_day,
                day_of_week=day_of_week,
                delivered_at=datetime.utcnow(),
            )

            self.db.add(feedback)
            self.db.commit()

            logger.info(
                f"Recorded feedback for order {order_id}: "
                f"predicted={predicted_eta_min}min, actual={actual_delivery_min}min, "
                f"error={error_min:+.1f}min"
            )

            # Update rolling metrics
            self._update_rolling_metrics(tenant_id, error_min, actual_delivery_min, predicted_eta_min)

            return feedback.id

        except Exception as e:
            logger.error(f"Error recording delivery feedback: {e}")
            self.db.rollback()
            return None

    def _update_rolling_metrics(
        self, tenant_id: str, error_min: float, actual_min: float, predicted_min: float
    ) -> None:
        """Update 7-day rolling MAE and accuracy metrics in Redis."""
        try:
            if self._has_redis:
                self._update_redis_metrics(tenant_id, error_min, actual_min, predicted_min)
            else:
                self._update_memory_metrics(tenant_id, error_min, actual_min, predicted_min)
        except Exception as e:
            logger.error(f"Error updating rolling metrics: {e}")

    def _update_redis_metrics(
        self, tenant_id: str, error_min: float, actual_min: float, predicted_min: float
    ) -> None:
        """Update Redis-backed rolling metrics."""
        pipeline = self.redis_client.pipeline()
        timestamp = int(datetime.utcnow().timestamp())

        # Store error for 7-day window
        error_key = f"mae_errors_7day:{tenant_id}"
        pipeline.zadd(error_key, {str(timestamp): error_min})
        pipeline.expire(error_key, 7 * 86400)  # 7 days

        # Update running mean absolute error
        mae_key = f"mae_7day:{tenant_id}"
        abs_error = abs(error_min)

        # Store historical values for aggregation
        values_key = f"mae_values_7day:{tenant_id}"
        pipeline.zadd(values_key, {f"{timestamp}": abs_error})
        pipeline.expire(values_key, 7 * 86400)

        # Compute rolling 7-day MAE from sorted set
        now = datetime.utcnow()
        cutoff_time = now - timedelta(days=7)
        cutoff_timestamp = int(cutoff_time.timestamp())

        # Clean old data
        pipeline.zremrangebyscore(values_key, 0, cutoff_timestamp)

        pipeline.execute()

        # Recompute MAE across remaining values
        values = self.redis_client.zrange(values_key, 0, -1, withscores=False)
        if values:
            mae = sum(float(v) for v in values) / len(values)
            self.redis_client.set(mae_key, mae, ex=7 * 86400)
            logger.debug(f"Updated 7-day MAE for {tenant_id}: {mae:.2f} min")

    def _update_memory_metrics(
        self, tenant_id: str, error_min: float, actual_min: float, predicted_min: float
    ) -> None:
        """Update in-memory fallback metrics."""
        if tenant_id not in self.metrics_cache:
            self.metrics_cache[tenant_id] = {
                "errors": [],
                "last_update": datetime.utcnow(),
            }

        cache = self.metrics_cache[tenant_id]

        # Keep only 7-day errors (assuming ~100 deliveries/day max)
        cutoff_time = datetime.utcnow() - timedelta(days=7)
        cache["errors"] = [
            (ts, err) for ts, err in cache["errors"] if ts > cutoff_time
        ]

        cache["errors"].append((datetime.utcnow(), abs(error_min)))
        cache["last_update"] = datetime.utcnow()

    def get_7day_metrics(self, tenant_id: str) -> Dict[str, Any]:
        """
        Fetch 7-day rolling metrics for tenant.

        Returns:
            Dict with mae_7day, accuracy_7day, sample_count, last_update
        """
        try:
            if self._has_redis:
                return self._get_redis_metrics(tenant_id)
            else:
                return self._get_memory_metrics(tenant_id)
        except Exception as e:
            logger.error(f"Error fetching 7-day metrics: {e}")
            return {
                "mae_7day": None,
                "accuracy_7day": None,
                "sample_count": 0,
                "last_update": None,
            }

    def _get_redis_metrics(self, tenant_id: str) -> Dict[str, Any]:
        """Fetch metrics from Redis."""
        mae_key = f"mae_7day:{tenant_id}"
        values_key = f"mae_values_7day:{tenant_id}"

        # Get current MAE
        mae = self.redis_client.get(mae_key)
        mae_value = float(mae) if mae else None

        # Get sample count
        values = self.redis_client.zrange(values_key, 0, -1, withscores=False)
        sample_count = len(values)

        # Accuracy = percent of predictions within 15 mins
        if values:
            within_15 = sum(1 for v in values if float(v) <= 15)
            accuracy = (within_15 / sample_count) * 100
        else:
            accuracy = None

        return {
            "mae_7day": mae_value,
            "accuracy_7day": accuracy,
            "sample_count": sample_count,
            "last_update": datetime.utcnow(),
        }

    def _get_memory_metrics(self, tenant_id: str) -> Dict[str, Any]:
        """Fetch metrics from memory cache."""
        if tenant_id not in self.metrics_cache:
            return {
                "mae_7day": None,
                "accuracy_7day": None,
                "sample_count": 0,
                "last_update": None,
            }

        cache = self.metrics_cache[tenant_id]
        errors = [err for _, err in cache["errors"]]

        if not errors:
            return {
                "mae_7day": None,
                "accuracy_7day": None,
                "sample_count": 0,
                "last_update": cache["last_update"],
            }

        mae = sum(errors) / len(errors)
        within_15 = sum(1 for e in errors if e <= 15)
        accuracy = (within_15 / len(errors)) * 100

        return {
            "mae_7day": mae,
            "accuracy_7day": accuracy,
            "sample_count": len(errors),
            "last_update": cache["last_update"],
        }
