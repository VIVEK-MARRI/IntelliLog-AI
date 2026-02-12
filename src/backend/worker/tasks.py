import logging
from typing import List, Dict, Any
from src.backend.worker.celery_app import celery_app
from src.backend.app.services.optimization_service import OptimizationService
from src.backend.app.core.config import settings
from src.ml.training.retrain import retrain_production_model
from src.ml.monitoring.drift_detection import compute_drift_report, should_retrain

logger = logging.getLogger(__name__)

@celery_app.task(acks_late=True)
def optimize_route_task(
    orders: List[Dict[str, Any]],
    drivers: int = 3,
    method: str = "ortools"
) -> Dict[str, Any]:
    """
    Async task to run route optimization.
    """
    try:
        logger.info("Received optimization task.")
        result = OptimizationService.calculate_routes(orders, drivers=drivers, method=method)
        return result
    except Exception as e:
        logger.error(f"Task failed: {e}")
        return {"error": str(e)}


@celery_app.task(acks_late=True)
def drift_check_task() -> Dict[str, Any]:
    """Check data drift and decide whether retraining is needed."""
    if not settings.DRIFT_DETECTION_ENABLED:
        return {"status": "skipped", "reason": "drift detection disabled"}

    report = compute_drift_report()
    score = report.get("overall_drift_score", 0.0)
    action = "retrain" if should_retrain(score, settings.DRIFT_SCORE_THRESHOLD) else "monitor"
    logger.info("Drift score: %.4f (threshold=%.2f) -> %s", score, settings.DRIFT_SCORE_THRESHOLD, action)
    return {"status": "ok", "action": action, "report": report}


@celery_app.task(acks_late=True)
def retrain_eta_model_task() -> Dict[str, Any]:
    """Automated retraining pipeline for ETA model."""
    if not settings.AUTO_RETRAIN_ENABLED:
        return {"status": "skipped", "reason": "auto retrain disabled"}

    drift_report = None
    if settings.DRIFT_DETECTION_ENABLED:
        drift_report = compute_drift_report()
        score = drift_report.get("overall_drift_score", 0.0)
        if not should_retrain(score, settings.DRIFT_SCORE_THRESHOLD):
            return {"status": "skipped", "reason": "drift below threshold", "drift": drift_report}

    result = retrain_production_model()
    return {"status": "success", "training": result, "drift": drift_report}
