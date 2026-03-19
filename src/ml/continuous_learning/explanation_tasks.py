"""
Celery tasks for generating and storing SHAP explanations.
"""

import json
import logging
from typing import Optional

from celery import shared_task
from sqlalchemy.orm import Session

from src.backend.app.db.models import DeliveryFeedback, Order
from src.backend.app.db.session import SessionLocal
from src.ml.features.driver_familiarity import DriverFamiliarityScorer
from src.ml.models.eta_predictor import ETAPredictor

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def generate_explanation_task(
    self,
    delivery_feedback_id: str,
    model_path: Optional[str] = None,
) -> dict:
    """
    Generate SHAP explanation for a prediction and store it.

    Called asynchronously after each ETA prediction is made.

    Args:
        delivery_feedback_id: ID of DeliveryFeedback record
        model_path: Path to trained model (uses latest if None)

    Returns:
        Dict with status and explanation ID
    """
    try:
        db = SessionLocal()

        # Fetch feedback record
        feedback = db.query(DeliveryFeedback).filter(
            DeliveryFeedback.id == delivery_feedback_id
        ).first()

        if not feedback:
            logger.error(f"Feedback record not found: {delivery_feedback_id}")
            return {"status": "failed", "reason": "Feedback not found"}

        # Reconstruct feature vector from feedback
        # Note: This assumes features are stored or reconstructable from feedback
        # In practice, you'd reconstruct the feature vector that was input to the model
        feature_dict = _reconstruct_features_from_feedback(feedback)

        if not feature_dict:
            logger.warning(f"Could not reconstruct features for {delivery_feedback_id}")
            # Don't fail - just skip explanation generation
            return {"status": "skipped", "reason": "Features not available"}

        # Load model
        model = ETAPredictor(model_path=model_path)
        if model.model is None:
            logger.error("Could not load model for explanation")
            return {"status": "failed", "reason": "Model load failed"}

        # Get driver familiarity if driver exists
        additional_features = {}
        if feedback.driver_id:
            scorer = DriverFamiliarityScorer(db_session=db)
            # Zone would need to be extracted from coordinates or stored in feedback
            zone_id = f"zone_{feedback.driver_id}"  # Placeholder
            familiarity = scorer.get_driver_zone_familiarity(feedback.driver_id, zone_id)
            additional_features["driver_zone_familiarity"] = familiarity

        # Generate explanation
        import pandas as pd

        X = pd.DataFrame([feature_dict])
        if model.explainer is None:
            logger.warning("SHAP explainer not initialized, using basic explanation")
            explanation_text = f"Predicted {feedback.predicted_eta_min:.0f} minutes"
        else:
            try:
                from src.ml.models.shap_explainer import explain_prediction

                explanation = explain_prediction(
                    model=model,
                    X=X,
                    shap_explainer=model.explainer,
                    sample_idx=0,
                    additional_features=additional_features,
                )
            except Exception as e:
                logger.error(f"Error generating SHAP explanation: {e}")
                explanation = {
                    "summary": f"Predicted {feedback.predicted_eta_min:.0f} minutes",
                    "factors": [],
                    "what_would_help": None,
                }

        # Store explanation as JSON
        feedback.explanation_json = json.dumps(
            {
                "summary": explanation.get("summary", ""),
                "factors": explanation.get("factors", []),
                "what_would_help": explanation.get("what_would_help"),
                "base_prediction": explanation.get("base_prediction", feedback.predicted_eta_min),
                "actual_prediction": explanation.get("actual_prediction", feedback.predicted_eta_min),
                "eta_p10": explanation.get("base_prediction", feedback.predicted_eta_min) - 5,
                "eta_p90": explanation.get("base_prediction", feedback.predicted_eta_min) + 5,
                "confidence_within_5min": 0.75,
                "generated_at": pd.Timestamp.utcnow().isoformat(),
            }
        )

        db.add(feedback)
        db.commit()
        db.close()

        logger.info(f"Explanation generated for {delivery_feedback_id}")
        return {
            "status": "success",
            "delivery_feedback_id": delivery_feedback_id,
            "factors_count": len(explanation.get("factors", [])),
        }

    except Exception as e:
        logger.error(f"Error in explanation task: {e}")
        self.retry(exc=e, countdown=60)


@shared_task(bind=True, max_retries=2)
def backfill_explanations_task(
    self,
    limit: int = 1000,
    days_back: int = 7,
) -> dict:
    """
    Backfill SHAP explanations for recent predictions without explanations.

    Useful for migrating existing predictions or if explanation generation failed.

    Args:
        limit: Maximum number of records to process
        days_back: Only process predictions from last N days

    Returns:
        Dict with count of generated/failed explanations
    """
    try:
        from datetime import datetime, timedelta

        db = SessionLocal()

        cutoff = datetime.utcnow() - timedelta(days=days_back)

        # Find feedbacks without explanations
        feedbacks = (
            db.query(DeliveryFeedback)
            .filter(
                DeliveryFeedback.predicted_at >= cutoff,
                DeliveryFeedback.explanation_json.is_(None),
            )
            .limit(limit)
            .all()
        )

        logger.info(f"Backfilling {len(feedbacks)} explanations")

        generated = 0
        failed = 0

        for feedback in feedbacks:
            result = generate_explanation_task.apply_async(
                args=[feedback.id],
            )

            if result.state == "SUCCESS":
                generated += 1
            else:
                failed += 1

        db.close()

        logger.info(f"Backfill complete: {generated} generated, {failed} failed")
        return {
            "status": "complete",
            "generated": generated,
            "failed": failed,
        }

    except Exception as e:
        logger.error(f"Error in backfill explanations task: {e}")
        self.retry(exc=e, countdown=300)


def _reconstruct_features_from_feedback(feedback: DeliveryFeedback) -> dict:
    """
    Reconstruct feature vector from stored feedback.

    This is a placeholder - in production, you'd reconstruct the exact features
    that were input to the model at prediction time.
    """
    if not feedback:
        return None

    features = {}

    # Basic features from feedback
    if feedback.distance_km:
        features["distance_km"] = float(feedback.distance_km)

    if feedback.time_of_day:
        time_map = {"morning": 0, "afternoon": 1, "evening": 2, "night": 3}
        features["time_of_day_encoded"] = float(time_map.get(feedback.time_of_day, 1))

    if feedback.day_of_week is not None:
        features["day_of_week"] = float(feedback.day_of_week)

    if feedback.traffic_condition:
        traffic_map = {"free_flow": 0, "moderate": 1, "congested": 2, "heavy": 3}
        features["traffic_encoded"] = float(traffic_map.get(feedback.traffic_condition, 1))

    if feedback.weather:
        weather_map = {"clear": 0, "rain": 1, "snow": 2, "fog": 1}
        features["weather_severity"] = float(weather_map.get(feedback.weather, 0))

    if feedback.vehicle_type:
        vehicle_map = {"car": 0, "van": 1, "truck": 2}
        features["vehicle_type"] = float(vehicle_map.get(feedback.vehicle_type, 0))

    # Default values for features not in feedback
    features.setdefault("weight", 1.0)
    features.setdefault("current_traffic_ratio", 1.0)
    features.setdefault("is_peak_hour", 0)
    features.setdefault("historical_avg_traffic_same_hour", 1.0)

    return features if features else None
