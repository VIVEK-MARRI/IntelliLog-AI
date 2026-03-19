"""
Celery tasks for continuous learning pipeline.
Orchestrates retraining, drift detection, and model promotion.
"""

import logging
from typing import Optional

from celery import Celery, shared_task, group, chord
from celery.schedules import crontab
from sqlalchemy.orm import Session

from src.backend.app.core.config import settings
from src.backend.app.db.base import SessionLocal
from src.ml.continuous_learning.feedback_collector import FeedbackCollector
from src.ml.continuous_learning.drift_detector import DriftDetector
from src.ml.continuous_learning.model_retrainer import ModelRetrainer
from src.ml.continuous_learning.model_promoter import ModelPromoter

logger = logging.getLogger(__name__)

# Initialize Celery app
app = Celery(
    "intellog_ml",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

app.conf.update(
    timezone=settings.CELERY_TIMEZONE,
    enable_utc=settings.CELERY_ENABLE_UTC,
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
)

# Beat schedule - periodic tasks
app.conf.beat_schedule = {
    "retrain-models": {
        "task": "src.ml.continuous_learning.celery_tasks.retrain_models_task",
        "schedule": crontab(hour=2, minute=0),  # 2:00 AM UTC daily
    },
    "aggregate-traffic-patterns": {
        "task": "src.ml.continuous_learning.celery_tasks.aggregate_traffic_patterns_task",
        "schedule": crontab(hour=3, minute=0),  # 3:00 AM UTC daily
    },
    "detect-drift": {
        "task": "src.ml.continuous_learning.celery_tasks.detect_drift_task",
        "schedule": crontab(hour=6, minute=0),  # 6:00 AM UTC daily
    },
    "check-staging-models": {
        "task": "src.ml.continuous_learning.celery_tasks.check_staging_models_task",
        "schedule": crontab(hour="*/6"),  # Every 6 hours
    },
    "update-metrics": {
        "task": "src.ml.continuous_learning.celery_tasks.update_metrics_task",
        "schedule": crontab(minute="*/30"),  # Every 30 minutes
    },
}


# Tasks

@app.task(bind=True, max_retries=3)
def retrain_models_task(self) -> dict:
    """
    Daily retraining task: retrain models for all tenants.
    Runs at 2:00 AM UTC.
    """
    try:
        logger.info("Starting daily retraining task")
        db = SessionLocal()

        retrainer = ModelRetrainer(db)
        results = retrainer.retrain_all_active_tenants()

        db.close()

        logger.info(f"Retraining task completed: {len(results)} tenants processed")
        return {"status": "success", "tenants_processed": len(results), "results": results}

    except Exception as e:
        logger.error(f"Error in retraining task: {e}")
        # Retry with exponential backoff
        self.retry(exc=e, countdown=60 * (2 ** self.request.retries))


@app.task(bind=True, max_retries=3)
def retrain_model_for_tenant_task(self, tenant_id: str) -> dict:
    """
    Retrain model for a specific tenant.
    Can be triggered on demand or by scheduler.
    """
    try:
        logger.info(f"Retraining model for tenant {tenant_id}")
        db = SessionLocal()

        retrainer = ModelRetrainer(db)
        result = retrainer.retrain_model(tenant_id, lookback_days=30)

        db.close()

        logger.info(f"Retraining for {tenant_id} completed: {result['status']}")
        return result

    except Exception as e:
        logger.error(f"Error retraining for {tenant_id}: {e}")
        self.retry(exc=e, countdown=60 * (2 ** self.request.retries))


@app.task(bind=True, max_retries=3)
def detect_drift_task(self) -> dict:
    """
    Daily drift detection task: check for data drift in all tenants.
    Runs at 6:00 AM UTC.
    """
    try:
        logger.info("Starting daily drift detection task")
        db = SessionLocal()

        detector = DriftDetector(db)
        results = detector.detect_drift_for_all_tenants()

        # For high severity drifts, trigger emergency retraining
        for tenant_id, result in results.items():
            if result.get("severity") == "high":
                logger.warning(f"High severity drift detected for {tenant_id}, triggering emergency retrain")
                emergency_retrain_task.delay(tenant_id)

        db.close()

        logger.info(f"Drift detection task completed: {len(results)} tenants checked")
        return {"status": "success", "tenants_checked": len(results), "results": results}

    except Exception as e:
        logger.error(f"Error in drift detection task: {e}")
        self.retry(exc=e, countdown=60 * (2 ** self.request.retries))


@app.task(bind=True, max_retries=5)
def detect_drift_for_tenant_task(self, tenant_id: str) -> dict:
    """
    Detect drift for a specific tenant.
    """
    try:
        logger.info(f"Detecting drift for tenant {tenant_id}")
        db = SessionLocal()

        detector = DriftDetector(db)
        result = detector.detect_drift(tenant_id)

        if result.get("severity") == "high":
            logger.warning(f"High severity drift for {tenant_id}, queuing emergency retrain")
            emergency_retrain_task.delay(tenant_id)

        db.close()

        return result

    except Exception as e:
        logger.error(f"Error detecting drift for {tenant_id}: {e}")
        self.retry(exc=e, countdown=60 * (2 ** self.request.retries))


@app.task(bind=True, max_retries=2)
def emergency_retrain_task(self, tenant_id: str) -> dict:
    """
    Emergency retraining on high severity drift.
    Uses shorter lookback period (7 days) for faster turnaround.
    """
    try:
        logger.warning(f"Emergency retraining for tenant {tenant_id}")
        db = SessionLocal()

        retrainer = ModelRetrainer(db)
        result = retrainer.retrain_model(tenant_id, lookback_days=7)

        db.close()

        logger.info(f"Emergency retraining for {tenant_id}: {result['status']}")
        return result

    except Exception as e:
        logger.error(f"Error in emergency retraining for {tenant_id}: {e}")
        self.retry(exc=e, countdown=30 * (2 ** self.request.retries))


@app.task(bind=True, max_retries=3)
def start_ab_test_task(self, tenant_id: str, model_b_version: str) -> dict:
    """
    Start A/B test between production and staging model.
    Called after successful staging model creation.
    """
    try:
        logger.info(f"Starting A/B test for {tenant_id}: staging={model_b_version}")
        db = SessionLocal()

        promoter = ModelPromoter(db)
        ab_test_id = promoter.start_ab_test(tenant_id, model_b_version)

        db.close()

        if ab_test_id:
            logger.info(f"A/B test started: {ab_test_id}")
            return {"status": "success", "ab_test_id": ab_test_id}
        else:
            logger.error(f"Failed to start A/B test for {tenant_id}")
            return {"status": "failed"}

    except Exception as e:
        logger.error(f"Error starting A/B test: {e}")
        self.retry(exc=e, countdown=60 * (2 ** self.request.retries))


@app.task(bind=True, max_retries=3)
def check_staging_models_task(self) -> dict:
    """
    Check if staging models should be promoted to production.
    Runs every 6 hours.
    """
    try:
        logger.info("Checking staging models for promotion")
        db = SessionLocal()

        from src.backend.app.db.models import Tenant

        tenants = db.query(Tenant).all()
        results = {}

        promoter = ModelPromoter(db)
        for tenant in tenants:
            promoted_model = promoter.check_staging_models_promotion(tenant.id)
            if promoted_model:
                results[tenant.id] = {"promoted": promoted_model}
                logger.info(f"Promoted {promoted_model} for {tenant.id}")
            else:
                results[tenant.id] = {"promoted": None}

        db.close()

        logger.info(f"Staging model check completed: {len(results)} tenants")
        return {"status": "success", "promoted_count": sum(1 for r in results.values() if r["promoted"])}

    except Exception as e:
        logger.error(f"Error checking staging models: {e}")
        self.retry(exc=e, countdown=60 * (2 ** self.request.retries))


@app.task(bind=True, max_retries=3)
def promote_model_task(self, tenant_id: str, model_version: str) -> dict:
    """
    Promote model to production.
    """
    try:
        logger.info(f"Promoting {model_version} to production for {tenant_id}")
        db = SessionLocal()

        promoter = ModelPromoter(db)
        result = promoter.promote_model_to_production(tenant_id, model_version)

        db.close()

        if result:
            logger.info(f"Model promoted: {result}")
            return {"status": "success", "model_version": result}
        else:
            logger.error(f"Promotion failed for {model_version}")
            return {"status": "failed"}

    except Exception as e:
        logger.error(f"Error promoting model: {e}")
        self.retry(exc=e, countdown=60 * (2 ** self.request.retries))


@app.task(bind=True, max_retries=2)
def update_metrics_task(self) -> dict:
    """
    Update Prometheus metrics for monitoring.
    Runs every 30 minutes.
    """
    try:
        logger.debug("Updating Prometheus metrics")
        db = SessionLocal()

        from src.ml.continuous_learning.metrics_collector import MetricsCollector

        collector = MetricsCollector(db)
        collector.update_all_metrics()

        db.close()

        return {"status": "success"}

    except Exception as e:
        logger.error(f"Error updating metrics: {e}")
        self.retry(exc=e, countdown=60 * (2 ** self.request.retries))


@app.task(bind=True, max_retries=2)
def aggregate_traffic_patterns_task(self) -> dict:
    """
    Aggregate historical traffic patterns from delivery feedback.
    Runs daily at 3:00 AM UTC to populate TrafficPattern table.
    """
    try:
        logger.info("Aggregating traffic patterns from delivery feedback")
        db = SessionLocal()

        from src.backend.app.db.models import DeliveryFeedback, TrafficPattern
        from datetime import datetime, timedelta
        import numpy as np

        # Get deliveries from last 30 days
        cutoff_time = datetime.utcnow() - timedelta(days=30)
        deliveries = db.query(DeliveryFeedback).filter(
            DeliveryFeedback.created_at >= cutoff_time,
            DeliveryFeedback.actual_delivery_min.isnot(None),
            DeliveryFeedback.distance_km.isnot(None),
        ).all()

        logger.info(f"Processing {len(deliveries)} deliveries for traffic aggregation")

        # Helper function to get zone ID
        def get_zone_id(lat: float, lng: float) -> str:
            """Get zone ID from coordinates (1km grid)."""
            zone_lat = int(lat / 0.009) * 0.009
            zone_lng = int(lng / 0.009) * 0.009
            return f"{zone_lat:.3f}_{zone_lng:.3f}"

        # Group by zone_origin, zone_dest, weekday, hour
        aggregates = {}
        for delivery in deliveries:
            try:
                # Skip if missing required data
                if not delivery.origin_lat or not delivery.origin_lng:
                    continue
                if not delivery.dest_lat or not delivery.dest_lng:
                    continue

                origin_zone = get_zone_id(delivery.origin_lat, delivery.origin_lng)
                dest_zone = get_zone_id(delivery.dest_lat, delivery.dest_lng)
                weekday = delivery.day_of_week or datetime.utcnow().weekday()

                # Extract hour from time_of_day or use default
                time_of_day_map = {
                    "morning": 9,
                    "afternoon": 14,
                    "evening": 18,
                    "night": 22,
                }
                hour = time_of_day_map.get(delivery.time_of_day, 12)

                key = (origin_zone, dest_zone, weekday, hour)

                # Compute traffic ratio: actual_time / (distance / 30 * 60)
                base_time = (delivery.distance_km / 30.0) * 60.0
                traffic_ratio = delivery.actual_delivery_min / base_time if base_time > 0 else 1.0

                if key not in aggregates:
                    aggregates[key] = {
                        "travel_times": [],
                        "traffic_ratios": [],
                        "distances": [],
                    }

                aggregates[key]["travel_times"].append(delivery.actual_delivery_min)
                aggregates[key]["traffic_ratios"].append(traffic_ratio)
                aggregates[key]["distances"].append(delivery.distance_km)

            except Exception as e:
                logger.debug(f"Error processing delivery {delivery.id}: {e}")
                continue

        # Store aggregates in database
        patterns_created = 0
        patterns_updated = 0

        for (origin_zone, dest_zone, weekday, hour), data in aggregates.items():
            try:
                # Query existing pattern
                pattern = db.query(TrafficPattern).filter(
                    TrafficPattern.zone_origin == origin_zone,
                    TrafficPattern.zone_dest == dest_zone,
                    TrafficPattern.weekday == weekday,
                    TrafficPattern.hour == hour,
                ).first()

                avg_travel_time = float(np.mean(data["travel_times"]))
                std_travel_time = float(np.std(data["travel_times"]))
                avg_traffic_ratio = float(np.mean(data["traffic_ratios"]))
                std_traffic_ratio = float(np.std(data["traffic_ratios"]))
                avg_distance = float(np.mean(data["distances"]))

                if pattern:
                    # Update existing
                    pattern.avg_travel_time_min = avg_travel_time
                    pattern.std_travel_time_min = std_travel_time
                    pattern.avg_traffic_ratio = avg_traffic_ratio
                    pattern.std_traffic_ratio = std_traffic_ratio
                    pattern.avg_distance_meters = avg_distance * 1000  # Convert km to meters
                    pattern.sample_count = len(data["travel_times"])
                    pattern.last_updated = datetime.utcnow()
                    patterns_updated += 1
                else:
                    # Create new
                    pattern = TrafficPattern(
                        zone_origin=origin_zone,
                        zone_dest=dest_zone,
                        weekday=weekday,
                        hour=hour,
                        avg_travel_time_min=avg_travel_time,
                        std_travel_time_min=std_travel_time,
                        avg_traffic_ratio=avg_traffic_ratio,
                        std_traffic_ratio=std_traffic_ratio,
                        avg_distance_meters=avg_distance * 1000,
                        sample_count=len(data["travel_times"]),
                    )
                    patterns_created += 1

                db.add(pattern)

            except Exception as e:
                logger.error(f"Error storing pattern for {origin_zone}->{dest_zone}: {e}")
                continue

        db.commit()
        db.close()

        logger.info(
            f"Traffic aggregation completed: {patterns_created} created, "
            f"{patterns_updated} updated"
        )

        return {
            "status": "success",
            "patterns_created": patterns_created,
            "patterns_updated": patterns_updated,
        }

    except Exception as e:
        logger.error(f"Error aggregating traffic patterns: {e}")
        self.retry(exc=e, countdown=60 * (2 ** self.request.retries))



# Utility task for recording delivery feedback
@shared_task
def record_delivery_feedback_task(
    order_id: str,
    tenant_id: str,
    predicted_eta_min: float,
    actual_delivery_min: float,
    prediction_model_version: str,
    error_min: Optional[float] = None,
    driver_id: Optional[str] = None,
    traffic_condition: Optional[str] = None,
    weather: Optional[str] = None,
    vehicle_type: Optional[str] = None,
    distance_km: Optional[float] = None,
    time_of_day: Optional[str] = None,
    day_of_week: Optional[int] = None,
) -> dict:
    """
    Record delivery feedback asynchronously.
    Called on every DeliveryCompleted event.
    """
    try:
        db = SessionLocal()

        collector = FeedbackCollector(db)
        feedback_id = collector.record_delivery_feedback(
            order_id=order_id,
            tenant_id=tenant_id,
            predicted_eta_min=predicted_eta_min,
            actual_delivery_min=actual_delivery_min,
            prediction_model_version=prediction_model_version,
            driver_id=driver_id,
            traffic_condition=traffic_condition,
            weather=weather,
            vehicle_type=vehicle_type,
            distance_km=distance_km,
            time_of_day=time_of_day,
            day_of_week=day_of_week,
        )

        db.close()

        return {"status": "success" if feedback_id else "failed", "feedback_id": feedback_id}

    except Exception as e:
        logger.error(f"Error recording feedback: {e}")
        return {"status": "failed", "error": str(e)}
