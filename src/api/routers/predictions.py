"""
Predictions router.
Risk scores and delay predictions with SHAP explanations.
"""

from datetime import datetime, timezone

import redis.asyncio as redis
import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.auth import AuthenticatedTenant, get_current_tenant
from src.api.deps import get_db, get_prediction_service, get_redis
from src.api.schemas import PredictionResponse, RiskFactor
from src.core.config import get_settings
from src.core.metrics import (
    application_errors_total,
    model_cache_hits_total,
    model_cache_misses_total,
    model_predictions_total,
    prediction_latency_seconds,
    prediction_risk_score,
)
from src.db.redis_schema import get_prediction_updates_channel, get_pubsub_events_channel
from src.ml.inference import PredictionService

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["predictions"], prefix="/predictions")


def _confidence_to_score(confidence: str) -> float:
    """Map model confidence labels to the API's numeric confidence field."""
    mapping = {
        "high": 0.9,
        "medium": 0.75,
        "low": 0.6,
    }
    return mapping.get(confidence.lower(), 0.8)


@router.post("/batch", response_model=dict)
async def batch_predict(
    body: dict,
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    redis_client: redis.Redis = Depends(get_redis),
) -> dict[str, dict]:
    """
    Batch predictions for multiple order IDs.

    Accepts {"order_ids": ["..."]}.
    Returns a keyed object: {order_id: PredictionResponse-shaped dict}.

    Previously returned a list — that shape caused silent failures in 2 of 3
    frontend consumers (AICommandCenter.tsx used `batchResults[order.id]` which
    always returned undefined from a list; ModelInsights.tsx had an Array.isArray
    workaround proving the bug was known but patched locally instead of fixed).
    """
    order_ids = body.get("order_ids", [])
    logger.info("batch_predict", count=len(order_ids), tenant_id=current_tenant.tenant_id)
    results: dict[str, dict] = {}
    for oid in order_ids:
        cached = await redis_client.hgetall(f"prediction:{oid}")
        if cached:
            risk_score = float(cached.get("risk_score", 0.5))
            results[oid] = {
                "order_id": oid,
                "risk_score": risk_score,
                "is_high_risk": risk_score > 0.7,
                "predicted_delay_minutes": float(cached.get("predicted_delay_minutes", 0.0)),
                "confidence": float(cached.get("confidence", 0.8)),
            }
        else:
            results[oid] = {
                "order_id": oid,
                "risk_score": 0.5,
                "is_high_risk": False,
                "predicted_delay_minutes": 0.0,
                "confidence": 0.5,
            }
    return results


@router.get("/model/feature-importance", response_model=dict)
async def get_feature_importance(
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    prediction_service: PredictionService = Depends(get_prediction_service),
) -> dict:
    """
    Return global SHAP-based feature importance for the delay prediction model.

    Uses the loaded SHAP TreeExplainer and a representative synthetic sample
    to compute mean absolute SHAP values per feature.  This is backed by the
    actual model artefact — not a hardcoded payload.

    Previously this endpoint didn't exist: the catch-all route
    GET /model/{model_id:path} matched 'feature-importance' and 'info'
    identically, returning identical hardcoded data for both.
    """
    logger.info("get_feature_importance", tenant_id=current_tenant.tenant_id)
    try:
        import numpy as np

        # Build a representative sample using each feature's median from training stats
        feature_names = prediction_service.feature_names
        feature_stats = prediction_service.feature_stats

        sample_size = 100
        sample = np.array([
            [feature_stats.feature_medians.get(name, 0.5) for name in feature_names]
            for _ in range(sample_size)
        ])

        explainer = prediction_service._get_explainer()
        shap_values = explainer.shap_values(sample)  # shape: (sample_size, n_features)

        # Mean absolute SHAP = global feature importance
        mean_abs_shap = np.abs(shap_values).mean(axis=0)
        total = float(mean_abs_shap.sum()) or 1.0

        importance_list = sorted([
            {
                "feature": feature_names[i],
                "importance": float(mean_abs_shap[i]),
                "importance_pct": round(float(mean_abs_shap[i]) / total * 100, 2),
            }
            for i in range(len(feature_names))
        ], key=lambda x: x["importance"], reverse=True)

        return {
            "model_version": prediction_service.model_version,
            "method": "shap_mean_absolute",
            "sample_size": sample_size,
            "features": importance_list,
            "top_feature": importance_list[0]["feature"] if importance_list else None,
        }

    except Exception as e:
        logger.error("feature_importance_error", error=str(e))
        # Fallback: return feature names from model without SHAP values
        return {
            "model_version": getattr(prediction_service, "model_version", "unknown"),
            "method": "fallback_no_shap",
            "error": str(e),
            "features": [
                {"feature": name, "importance": None, "importance_pct": None}
                for name in getattr(prediction_service, "feature_names", [])
            ],
        }


@router.get("/model/info", response_model=dict)
async def get_model_info(
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    prediction_service: PredictionService = Depends(get_prediction_service),
) -> dict:
    """
    Return model metadata (version, features, thresholds, status).

    Distinct from feature-importance: returns configuration, not SHAP analysis.
    Previously both endpoints hit the same catch-all and returned identical data.
    """
    logger.info("get_model_info", tenant_id=current_tenant.tenant_id)
    return {
        "model_id": "delay-prediction-v1",
        "name": "Delay Prediction Model",
        "version": getattr(prediction_service, "model_version", "1.0.0"),
        "features": getattr(prediction_service, "feature_names", [
            "hour_of_day", "day_of_week", "speed",
            "stops_remaining", "driver_on_time_rate",
            "deviation_meters", "eta_minutes_remaining",
        ]),
        "optimal_threshold": getattr(prediction_service, "optimal_threshold", 0.7),
        "confidence_thresholds": {"high": 0.9, "medium": 0.75, "low": 0.6},
        "status": "active",
    }


@router.get("/{order_id}/history", response_model=list)
async def get_prediction_history(
    order_id: str,
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    redis_client: redis.Redis = Depends(get_redis),
) -> list[dict]:
    """
    Return recent prediction snapshots for an order.
    Reads from Redis prediction cache (the single latest value).
    Full history requires a time-series DB — returns latest snapshot.
    """
    logger.info("get_prediction_history", order_id=order_id, tenant_id=current_tenant.tenant_id)
    cached = await redis_client.hgetall(f"prediction:{order_id}")
    if not cached:
        return []
    return [{
        "order_id": order_id,
        "risk_score": float(cached.get("risk_score", 0.5)),
        "is_high_risk": float(cached.get("risk_score", 0.5)) > 0.7,
        "predicted_delay_minutes": float(cached.get("predicted_delay_minutes", 0.0)),
        "confidence": float(cached.get("confidence", 0.8)),
        "prediction_timestamp": datetime.now(timezone.utc).isoformat(),
    }]


@router.get("/{order_id}", response_model=PredictionResponse)
async def get_prediction(
    order_id: str,
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    redis_client: redis.Redis = Depends(get_redis),
    prediction_service: PredictionService = Depends(get_prediction_service),
) -> PredictionResponse:
    """
    Get current delay prediction for order.

    Returns risk score with top risk factors and SHAP explanations.
    Includes confidence and predicted delay in minutes.
    """
    logger.info(
        "get_prediction",
        order_id=order_id,
        tenant_id=current_tenant.tenant_id,
    )

    # Try Redis cache first (predictions cached with 30-second rate limit)
    try:
        cached_prediction = await redis_client.hgetall(
            f"prediction:{order_id}"
        )
        if cached_prediction:
            model_cache_hits_total.inc()

            risk_score = float(cached_prediction.get("risk_score", 0.5))
            predicted_delay = float(
                cached_prediction.get("predicted_delay_minutes", 0.0)
            )
            confidence = float(cached_prediction.get("confidence", 0.8))

            # Parse risk factors
            top_factors_json = cached_prediction.get(
                "top_risk_factors", "[]"
            )
            import json

            top_factors = json.loads(top_factors_json)

            return PredictionResponse(
                orderId=order_id,
                riskScore=risk_score,
                isHighRisk=risk_score > 0.70,
                confidence=confidence,
                topRiskFactors=[
                    RiskFactor(**factor) for factor in top_factors
                ],
                predictedDelayMinutes=predicted_delay,
                currentEta=datetime.now(timezone.utc),
                modelVersion="1.0.0",
                predictionTimestamp=datetime.now(timezone.utc),
            )
    except Exception as e:
        logger.warning("prediction_cache_miss", error=str(e))

    # Fall back to running prediction
    try:
        model_cache_misses_total.inc()
        start_time = datetime.now(timezone.utc)

        # Get order state from Redis (fall back to PostgreSQL if not found)
        order_state = await redis_client.hgetall(f"order:{order_id}")
        if not order_state:
            settings = get_settings()
            from sqlalchemy.ext.asyncio import create_async_engine
            engine = create_async_engine(settings.database_url)
            async with AsyncSession(engine) as db:
                r = await db.execute(
                    text("SELECT planned_stops, completed_stops FROM orders WHERE id = :oid"),
                    {"oid": order_id}
                )
                row = r.fetchone()
                if row:
                    order_state = {
                        "planned_stops": str(row.planned_stops),
                        "completed_stops": str(row.completed_stops),
                        "stops_remaining": str(max(0, row.planned_stops - row.completed_stops)),
                        "eta_minutes_remaining": "60.0",
                        "speed": "0.0",
                        "deviation_meters": "0.0",
                        "driver_on_time_rate": "0.85",
                    }
                else:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Order {order_id} not found",
                    )
            await engine.dispose()

        # Build the live feature vector expected by the model.
        features = prediction_service.feature_builder.build_from_live(
            {
                "order_id": order_id,
                "planned_stops": int(order_state.get("planned_stops", 1)),
                "completed_stops": int(order_state.get("completed_stops", 0)),
                "planned_duration_minutes": float(
                    order_state.get("planned_duration_minutes", 60.0)
                ),
                "actual_duration_so_far_minutes": float(
                    order_state.get("actual_duration_so_far_minutes", 0.0)
                ),
                "stops_remaining": int(order_state.get("stops_remaining", 0)),
                "eta_minutes_remaining": float(
                    order_state.get("eta_minutes_remaining", 0.0)
                ),
                "speed": float(order_state.get("speed", 35.0)),
                "deviation_meters": float(order_state.get("deviation_meters", 0.0)),
                "hour_of_day": datetime.now(timezone.utc).hour,
                "day_of_week": datetime.now(timezone.utc).weekday(),
            },
            {
                "driver_on_time_rate": float(order_state.get("driver_on_time_rate", 0.85)),
            },
        )

        # Run prediction with SHAP so the API can return structured factors.
        result = prediction_service.predict_with_shap(order_id, features)

        # Convert the service's SHAP output into the API response schema.
        top_factors = [
            RiskFactor(
                feature=factor["feature"],
                contribution=factor["contribution"],
                direction=factor["direction"],
                humanReadable=(
                    f"{factor['feature']} {factor['direction'].replace('_', ' ')}"
                ),
            )
            for factor in result.top_risk_factors
        ]

        import json

        prediction_payload = {
            "type": "prediction_updated",
            "order_id": order_id,
            "tenant_id": current_tenant.tenant_id,
            "risk_score": result.risk_score,
            "predicted_delay_minutes": result.predicted_delay_minutes,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        await redis_client.hset(
            f"prediction:{order_id}",
            mapping={
                "risk_score": str(result.risk_score),
                "predicted_delay_minutes": str(result.predicted_delay_minutes),
                "confidence": str(_confidence_to_score(result.confidence)),
                "top_risk_factors": json.dumps([f.model_dump(by_alias=True) for f in top_factors]),
            },
        )
        await redis_client.expire(f"prediction:{order_id}", 30)

        await redis_client.publish(
            get_prediction_updates_channel(),
            json.dumps(prediction_payload),
        )
        await redis_client.publish(
            get_pubsub_events_channel(current_tenant.tenant_id),
            json.dumps(prediction_payload),
        )

        latency_s = (datetime.now(timezone.utc) - start_time).total_seconds()
        model_predictions_total.inc()
        prediction_latency_seconds.observe(latency_s)
        prediction_risk_score.labels(tenant_id=current_tenant.tenant_id).observe(result.risk_score)

        logger.info(
            "prediction_computed",
            order_id=order_id,
            risk_score=result.risk_score,
        )

        return PredictionResponse(
            orderId=order_id,
            riskScore=result.risk_score,
            isHighRisk=result.risk_score > 0.70,
            confidence=_confidence_to_score(result.confidence),
            topRiskFactors=top_factors,
            predictedDelayMinutes=result.predicted_delay_minutes,
            currentEta=datetime.now(timezone.utc),
            modelVersion=result.model_version,
            predictionTimestamp=datetime.now(timezone.utc),
        )

    except Exception as e:
        application_errors_total.labels(error_type="prediction", component="predictions_router").inc()
        logger.error("prediction_error", order_id=order_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute prediction",
        )
