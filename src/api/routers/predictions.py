"""
Predictions router.
Risk scores and delay predictions with SHAP explanations.
"""

from datetime import datetime, timezone

import redis.asyncio as redis
import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from src.api.auth import AuthenticatedTenant, get_current_tenant
from src.api.deps import get_db, get_prediction_service, get_redis
from src.api.schemas import PredictionResponse, RiskFactor
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
        # Get order state from Redis
        order_state = await redis_client.hgetall(f"order:{order_id}")
        if not order_state:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Order {order_id} not found",
            )

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
                "top_risk_factors": json.dumps([f.model_dump() for f in top_factors]),
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
        logger.error("prediction_error", order_id=order_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute prediction",
        )
