import json
import logging
import asyncio
from contextlib import nullcontext
from datetime import datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING, List, Dict, Any

import numpy as np
import redis
import redis as redis_lib
from scipy.stats import ttest_ind
from sqlalchemy.orm import Session

from src.backend.worker.celery_app import celery_app
from src.backend.app.services.optimization_service import OptimizationService
from src.backend.app.core.config import settings
from src.backend.app.db.base import SessionLocal
from src.backend.app.db.models import ABTest, DeliveryFeedback, Driver, Order, Route
from src.ml.features.store import get_feature_store
from src.ml.features.traffic_cache import TrafficCache
from src.ml.features.traffic_client import LatLon
from src.optimization.ml_travel_matrix import MLTravelTimeMatrix
from src.optimization.route_optimizer import RouteOptimizer
from src.ml.training.retrain import retrain_production_model

if TYPE_CHECKING:
    from src.ml.models.eta_predictor import ETAPredictor
from src.ml.monitoring.drift_detection import compute_drift_report, should_retrain

try:
    import mlflow
    _HAS_MLFLOW = True
except Exception:  # pragma: no cover - runtime dependency fallback
    mlflow = None
    _HAS_MLFLOW = False

logger = logging.getLogger(__name__)


def _run_async(awaitable: Any) -> Any:
    """Run an awaitable from sync Celery context."""
    try:
        return asyncio.run(awaitable)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(awaitable)
        finally:
            loop.close()


def _get_db_session() -> Session:
    """Create a short-lived SQLAlchemy session for Celery worker tasks."""
    return SessionLocal()


def _get_redis_client() -> redis.Redis:
    """Build Redis client used for active A/B test routing metadata."""
    return redis.from_url(settings.REDIS_FEATURE_STORE_URL, decode_responses=True)


def _get_current_production_version() -> str:
    """Read current production model version from latest version metadata."""
    latest_version_file = Path("models/latest_version.json")
    if not latest_version_file.exists():
        raise FileNotFoundError("models/latest_version.json not found; cannot start A/B test")

    with latest_version_file.open("r", encoding="utf-8") as fp:
        latest = json.load(fp)

    version = str(latest.get("version", "")).strip()
    if not version:
        raise ValueError("Missing production version in models/latest_version.json")
    if not version.startswith("v_"):
        version = f"v_{version}"
    return version


def _load_production_model_from_mlflow() -> "ETAPredictor":
    """
    Load production ETA model from MLflow artifacts with local fallback.
    """
    latest_version_file = Path("models/latest_version.json")
    if not latest_version_file.exists():
        raise FileNotFoundError("models/latest_version.json not found")

    with latest_version_file.open("r", encoding="utf-8") as fp:
        latest = json.load(fp)

    version = str(latest.get("version", "")).strip()
    if not version:
        raise ValueError("Missing production version in latest_version.json")
    if not version.startswith("v_"):
        version = f"v_{version}"

    if _HAS_MLFLOW:
        mlflow.set_tracking_uri(settings.MLFLOW_TRACKING_URI)
        mlflow.set_experiment(settings.MLFLOW_EXPERIMENT_NAME)

        run_id = str(latest.get("mlflow_run_id", "")).strip()
        if run_id:
            try:
                artifact_dir = Path(
                    mlflow.artifacts.download_artifacts(
                        run_id=run_id,
                        artifact_path="model_artifacts",
                    )
                )
                candidate_paths = [
                    artifact_dir / version,
                    artifact_dir,
                ]
                for candidate in candidate_paths:
                    if (candidate / "xgboost_model.json").exists():
                        from src.ml.models.eta_predictor import ETAPredictor

                        model = ETAPredictor(version=version)
                        model.load(candidate)
                        return model
            except Exception as mlflow_error:
                logger.warning("MLflow artifact load failed for run_id=%s: %s", run_id, mlflow_error)

    model_path = Path("models") / version
    if not model_path.exists():
        raise FileNotFoundError(f"Production model artifacts not found at {model_path}")

    from src.ml.models.eta_predictor import ETAPredictor

    model = ETAPredictor(version=version)
    model.load(model_path)
    return model


def promote_model_to_production(model_version: str) -> None:
    """Promote a model version by updating the production latest-version pointer."""
    latest_version_file = Path("models/latest_version.json")
    latest: Dict[str, Any] = {}
    if latest_version_file.exists():
        with latest_version_file.open("r", encoding="utf-8") as fp:
            latest = json.load(fp)

    latest["version"] = model_version
    latest["promoted_at"] = datetime.utcnow().isoformat()

    with latest_version_file.open("w", encoding="utf-8") as fp:
        json.dump(latest, fp, indent=2)


def archive_candidate_model(model_version: str, reason: str) -> None:
    """Archive a candidate model when it fails A/B promotion gates."""
    archive_file = Path("models/archived_candidates.json")
    archive_payload: List[Dict[str, Any]] = []
    if archive_file.exists():
        with archive_file.open("r", encoding="utf-8") as fp:
            archive_payload = json.load(fp)

    archive_payload.append(
        {
            "model_version": model_version,
            "reason": reason,
            "archived_at": datetime.utcnow().isoformat(),
        }
    )

    with archive_file.open("w", encoding="utf-8") as fp:
        json.dump(archive_payload, fp, indent=2)

@celery_app.task(
    bind=True,
    acks_late=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 3},
)
def optimize_route_task(
    self,
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


@celery_app.task(
    bind=True,
    acks_late=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 3},
)
def drift_check_task(self) -> Dict[str, Any]:
    """Check data drift and decide whether retraining is needed."""
    if not settings.DRIFT_DETECTION_ENABLED:
        return {"status": "skipped", "reason": "drift detection disabled"}

    report = compute_drift_report()
    score = report.get("overall_drift_score", 0.0)
    action = "retrain" if should_retrain(
        report,
        settings.DRIFT_SCORE_THRESHOLD,
        settings.DRIFT_MIN_FEATURES_FOR_RETRAIN,
    ) else "monitor"
    logger.info("Drift score: %.4f (threshold=%.2f) -> %s", score, settings.DRIFT_SCORE_THRESHOLD, action)
    return {"status": "ok", "action": action, "report": report}


@celery_app.task(
    bind=True,
    acks_late=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 3},
)
def retrain_eta_model_task(self) -> Dict[str, Any]:
    """Automated retraining pipeline for ETA model."""
    if not settings.AUTO_RETRAIN_ENABLED:
        return {"status": "skipped", "reason": "auto retrain disabled"}

    drift_report = None
    if settings.DRIFT_DETECTION_ENABLED:
        drift_report = compute_drift_report()
        if not should_retrain(
            drift_report,
            settings.DRIFT_SCORE_THRESHOLD,
            settings.DRIFT_MIN_FEATURES_FOR_RETRAIN,
        ):
            return {"status": "skipped", "reason": "drift below threshold", "drift": drift_report}

    result = retrain_production_model()
    return {"status": "success", "training": result, "drift": drift_report}


@celery_app.task(
    bind=True,
    acks_late=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 3},
)
def ab_shadow_evaluation_task(self) -> Dict[str, Any]:
    """
    Shadow task for A/B candidate evaluation.

    This task evaluates whether the current drift context warrants retraining
    a candidate model and records comparable metrics for promotion decisions.
    """
    if not settings.AB_TEST_ENABLED:
        return {"status": "skipped", "reason": "ab testing disabled"}

    drift_report = compute_drift_report() if settings.DRIFT_DETECTION_ENABLED else None
    should_train_candidate = True
    if drift_report is not None:
        should_train_candidate = should_retrain(
            drift_report,
            settings.DRIFT_SCORE_THRESHOLD,
            settings.DRIFT_MIN_FEATURES_FOR_RETRAIN,
        )

    if not should_train_candidate:
        return {
            "status": "skipped",
            "reason": "candidate not needed",
            "drift": drift_report,
        }

    candidate_result = retrain_production_model()
    return {
        "status": "success",
        "candidate": candidate_result,
        "drift": drift_report,
    }


@celery_app.task(
    bind=True,
    acks_late=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 3},
)
def ab_promotion_decision_task(self) -> Dict[str, Any]:
    """
    A/B promotion gate task.

    In this lightweight implementation, promotion remains a policy decision
    by external orchestration after inspecting MLflow metrics.
    """
    if not settings.AB_TEST_ENABLED:
        return {"status": "skipped", "reason": "ab testing disabled"}

    return {
        "status": "review_required",
        "message": "Inspect MLflow candidate vs baseline metrics before promotion.",
    }


@celery_app.task(
    bind=True,
    acks_late=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 3},
)
def start_ab_test(
    self,
    tenant_id: str,
    staged_model_version: str,
    duration_hours: int = 48,
) -> Dict[str, Any]:
    """
    Start a tenant-scoped A/B test without blocking worker execution.

    Creates a running A/B test row and schedules result collection using
    ``apply_async(eta=...)``. The task always returns immediately.
    """
    started_at = datetime.utcnow()
    ends_at = started_at + timedelta(hours=duration_hours)
    model_a_version = _get_current_production_version()

    db = _get_db_session()
    mlflow_context = nullcontext()
    if _HAS_MLFLOW:
        mlflow.set_tracking_uri(settings.MLFLOW_TRACKING_URI)
        mlflow.set_experiment(settings.MLFLOW_EXPERIMENT_NAME)
        mlflow_context = mlflow.start_run(run_name="start_ab_test", nested=True)

    try:
        with mlflow_context:
            test = ABTest(
                tenant_id=tenant_id,
                model_a_version=model_a_version,
                model_b_version=staged_model_version,
                started_at=started_at,
                ends_at=ends_at,
                status="running",
                winner=None,
            )
            db.add(test)
            db.commit()
            db.refresh(test)

            redis_client = _get_redis_client()
            redis_key = f"ab_test:{tenant_id}:active"
            redis_client.set(
                redis_key,
                json.dumps(
                    {
                        "test_id": test.id,
                        "model_a": model_a_version,
                        "model_b": staged_model_version,
                    }
                ),
                ex=max(duration_hours * 3600, 60),
            )

            collect_ab_results.apply_async(kwargs={"test_id": test.id}, eta=ends_at)

            if _HAS_MLFLOW:
                mlflow.log_params(
                    {
                        "tenant_id": tenant_id,
                        "model_a_version": model_a_version,
                        "model_b_version": staged_model_version,
                        "duration_hours": duration_hours,
                        "ab_test_id": test.id,
                    }
                )

            return {
                "status": "running",
                "test_id": test.id,
                "tenant_id": tenant_id,
                "model_a_version": model_a_version,
                "model_b_version": staged_model_version,
                "started_at": started_at.isoformat(),
                "ends_at": ends_at.isoformat(),
            }
    finally:
        db.close()


@celery_app.task(
    bind=True,
    acks_late=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 3},
)
def collect_ab_results(self, test_id: str) -> Dict[str, Any]:
    """
    Collect A/B outcomes and apply statistical winner selection.

    Criteria:
    - Compute two-sided Welch t-test on absolute prediction errors.
    - Promote candidate only if ``p_value < 0.05`` and candidate MAE is lower.
    """
    db = _get_db_session()
    mlflow_context = nullcontext()
    if _HAS_MLFLOW:
        mlflow.set_tracking_uri(settings.MLFLOW_TRACKING_URI)
        mlflow.set_experiment(settings.MLFLOW_EXPERIMENT_NAME)
        mlflow_context = mlflow.start_run(run_name="collect_ab_results", nested=True)

    try:
        with mlflow_context:
            test = db.query(ABTest).filter(ABTest.id == test_id).first()
            if test is None:
                raise ValueError(f"A/B test not found: {test_id}")

            feedback_rows = (
                db.query(DeliveryFeedback)
                .filter(
                    DeliveryFeedback.tenant_id == test.tenant_id,
                    DeliveryFeedback.predicted_at >= test.started_at,
                    DeliveryFeedback.predicted_at <= test.ends_at,
                    DeliveryFeedback.actual_delivery_min.isnot(None),
                )
                .all()
            )

            group_a_errors = np.array(
                [
                    abs(float(row.predicted_eta_min) - float(row.actual_delivery_min))
                    for row in feedback_rows
                    if row.prediction_model_version == test.model_a_version
                ],
                dtype=float,
            )
            group_b_errors = np.array(
                [
                    abs(float(row.predicted_eta_min) - float(row.actual_delivery_min))
                    for row in feedback_rows
                    if row.prediction_model_version == test.model_b_version
                ],
                dtype=float,
            )

            baseline_mae = float(np.mean(group_a_errors)) if group_a_errors.size else float("inf")
            candidate_mae = float(np.mean(group_b_errors)) if group_b_errors.size else float("inf")

            if group_a_errors.size >= 2 and group_b_errors.size >= 2:
                t_stat, p_value = ttest_ind(group_a_errors, group_b_errors, equal_var=False)
                p_value = float(p_value)
                t_stat = float(t_stat)
            else:
                p_value = 1.0
                t_stat = 0.0

            winner = test.model_a_version
            action = "archive_candidate"
            if p_value < 0.05 and candidate_mae < baseline_mae:
                promote_model_to_production(test.model_b_version)
                winner = test.model_b_version
                action = "promoted_candidate"
            else:
                archive_candidate_model(
                    test.model_b_version,
                    reason=f"A/B gate failed: p_value={p_value:.6f}, baseline_mae={baseline_mae:.6f}, candidate_mae={candidate_mae:.6f}",
                )

            test.status = "complete"
            test.winner = winner
            db.add(test)
            db.commit()

            redis_client = _get_redis_client()
            redis_client.delete(f"ab_test:{test.tenant_id}:active")

            if _HAS_MLFLOW:
                mlflow.log_params(
                    {
                        "ab_test_id": test.id,
                        "tenant_id": test.tenant_id,
                        "model_a_version": test.model_a_version,
                        "model_b_version": test.model_b_version,
                    }
                )
                mlflow.log_metrics(
                    {
                        "group_a_size": int(group_a_errors.size),
                        "group_b_size": int(group_b_errors.size),
                        "baseline_mae": baseline_mae,
                        "candidate_mae": candidate_mae,
                        "ttest_t_stat": t_stat,
                        "ttest_p_value": p_value,
                    }
                )

            return {
                "status": "complete",
                "test_id": test.id,
                "winner": winner,
                "action": action,
                "baseline_mae": baseline_mae,
                "candidate_mae": candidate_mae,
                "p_value": p_value,
                "group_a_size": int(group_a_errors.size),
                "group_b_size": int(group_b_errors.size),
            }
    finally:
        db.close()


@celery_app.task(
    bind=True,
    acks_late=True,
    autoretry_for=(Exception,),
    retry_backoff=60,
    retry_kwargs={"max_retries": 3},
)
def optimize_routes(
    self,
    tenant_id: str,
    order_ids: List[str],
    driver_ids: List[str],
) -> Dict[str, Any]:
    """Optimize routes with ML-predicted travel-time matrix fallback."""
    db = _get_db_session()
    mlflow_context = nullcontext()
    if _HAS_MLFLOW:
        mlflow.set_tracking_uri(settings.MLFLOW_TRACKING_URI)
        mlflow.set_experiment(settings.MLFLOW_EXPERIMENT_NAME)
        mlflow_context = mlflow.start_run(run_name=f"vrp_optimization_{tenant_id}", nested=True)

    try:
        with mlflow_context:
            # Step 1: Load orders and drivers from DB.
            orders = (
                db.query(Order)
                .filter(Order.tenant_id == tenant_id, Order.id.in_(order_ids), Order.status == "pending")
                .all()
            )
            drivers = (
                db.query(Driver)
                .filter(Driver.tenant_id == tenant_id, Driver.id.in_(driver_ids), Driver.status != "offline")
                .all()
            )

            if not orders:
                raise ValueError("No pending orders found for optimize_routes")
            if not drivers:
                raise ValueError("No active drivers found for optimize_routes")

            # Step 2: Build point list (drivers first, then orders).
            driver_points = [LatLon(float(d.current_lat), float(d.current_lng)) for d in drivers]
            order_points = [LatLon(float(o.lat), float(o.lng)) for o in orders]
            all_points = driver_points + order_points

            travel_time_matrix = None
            matrix_source = "static_fallback"
            model_version = "unknown"

            # Step 3: Load production model and build ML matrix.
            try:
                model = _load_production_model_from_mlflow()
                model_version = str(getattr(model, "version", "unknown"))

                traffic_cache = TrafficCache(db_session=db)
                redis_client = redis_lib.from_url(settings.REDIS_FEATURE_STORE_URL)

                ml_matrix_builder = MLTravelTimeMatrix(
                    model=model,
                    feature_store=None,
                    traffic_cache=traffic_cache,
                    redis_client=redis_client,
                    tenant_id=tenant_id,
                )

                travel_time_matrix = _run_async(ml_matrix_builder.build(all_points))
                matrix_source = "ml_predicted"
                logger.info(
                    "Built ML travel time matrix (%dx%d) for tenant %s",
                    len(all_points),
                    len(all_points),
                    tenant_id,
                )
            except Exception as e:
                logger.warning(
                    "ML matrix build failed for tenant %s: %s - using static fallback",
                    tenant_id,
                    e,
                )
                travel_time_matrix = None

            # Step 4: Solve VRP with ML matrix (or static fallback).
            optimizer = RouteOptimizer()
            optimization_result = _run_async(
                optimizer.solve(
                    orders=orders,
                    drivers=drivers,
                    travel_time_matrix=travel_time_matrix,
                    tenant_id=tenant_id,
                )
            )
            matrix_source = str(optimization_result.get("matrix_source", matrix_source))

            # Step 5: Persist routes and matrix source.
            created_routes: List[str] = []
            for route_index, route_data in enumerate(optimization_result.get("routes", [])):
                if not route_data.get("route"):
                    continue

                assigned_driver_id = route_data.get("driver_id")
                route = Route(
                    tenant_id=tenant_id,
                    driver_id=assigned_driver_id,
                    status="planned",
                    matrix_type=matrix_source,
                    matrix_source=matrix_source,
                    total_distance_km=float(route_data.get("load", 0.0) or 0.0),
                    total_duration_min=float(route_data.get("duration_min", 0.0) or 0.0),
                    geometry_json={
                        "points": route_data.get("route", []),
                        "method": "ortools",
                        "matrix_type": matrix_source,
                        "matrix_source": matrix_source,
                    },
                )
                db.add(route)
                db.flush()

                for order_id in route_data.get("route", []):
                    order = db.query(Order).filter(Order.id == order_id, Order.tenant_id == tenant_id).first()
                    if order:
                        order.route_id = route.id
                        order.status = "assigned"

                created_routes.append(route.id)

            db.commit()

            # Step 6: Log to MLflow for optimization observability.
            if _HAS_MLFLOW:
                mlflow.log_params(
                    {
                        "tenant_id": tenant_id,
                        "model_version": model_version,
                        "matrix_source": matrix_source,
                        "order_count": len(orders),
                        "driver_count": len(drivers),
                    }
                )
                mlflow.log_metrics(
                    {
                        "matrix_size": float(len(all_points) ** 2),
                        "routes_created": float(len(created_routes)),
                    }
                )

            return {
                "status": "success",
                "matrix_source": matrix_source,
                "routes": optimization_result,
                "route_ids": created_routes,
            }
    finally:
        db.close()
