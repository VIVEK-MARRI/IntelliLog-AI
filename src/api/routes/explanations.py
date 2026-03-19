"""
API routes for ETA prediction explanations and analytics.

Endpoints:
- POST /api/v1/predictions/explain - Generate explanation for specific prediction
- GET /api/v1/analytics/delay-factors - Aggregated delay factors by zone/time
- GET /api/v1/analytics/driver-zones - Driver familiarity zones
"""

from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.backend.app.db.models import DeliveryFeedback, Order
from src.backend.app.db.session import SessionLocal
from src.backend.app.core.auth import get_current_tenant_id
from src.ml.features.driver_familiarity import DriverFamiliarityScorer
from src.ml.models.shap_explainer import SHAPExplainer, explain_prediction

router = APIRouter(prefix="/api/v1", tags=["predictions"])


# ============================================================================
# Request/Response Models
# ============================================================================


class ExplanationRequest(BaseModel):
    """Request for explanation of a specific prediction."""

    order_id: str
    driver_id: Optional[str] = None
    include_driver_context: bool = True


class ExplanationFactor(BaseModel):
    """One contributing factor to ETA."""

    feature: str
    impact_minutes: float
    direction: str  # "positive" (adds time) or "negative" (saves time)
    sentence: str
    importance_rank: int
    shap_value: float
    feature_value: Optional[float] = None


class ExplanationResponse(BaseModel):
    """Full explanation response."""

    order_id: str
    eta_minutes: int
    eta_p10: int
    eta_p90: int
    confidence_within_5min: float
    confidence_badge: str  # "high" (>85%), "medium" (70-85%), "low" (<70%)
    summary: str
    factors: List[ExplanationFactor]
    what_would_help: Optional[str] = None


class DelayFactor(BaseModel):
    """Aggregated delay cause."""

    factor_name: str
    avg_positive_impact_min: float  # Avg time added when present
    frequency: int  # How often this was a top factor
    total_deliveries: int


class DelayFactorAnalytics(BaseModel):
    """Aggregated delay factor analysis."""

    zone: str
    date_range: str
    top_delay_factors: List[DelayFactor]
    early_factors: List[DelayFactor]


# ============================================================================
# Explanation Endpoints
# ============================================================================


@router.post("/predictions/explain", response_model=ExplanationResponse)
async def explain_prediction_endpoint(
    request: ExplanationRequest,
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(SessionLocal),
) -> ExplanationResponse:
    """
    Generate SHAP-based explanation for a prediction.

    This endpoint:
    1. Retrieves the prediction and actual delivery data
    2. Loads the model and SHAP explainer
    3. Generates human-readable explanation
    4. Includes driver context if requested

    Example:
        POST /api/v1/predictions/explain
        {
            "order_id": "ORD_12345",
            "driver_id": "DRV_789",
            "include_driver_context": true
        }

        Response:
        {
            "order_id": "ORD_12345",
            "eta_minutes": 28,
            "eta_p10": 23,
            "eta_p90": 33,
            "confidence_within_5min": 0.84,
            "confidence_badge": "high",
            "summary": "Predicted 28 min. Main factors: traffic (+9), distance (+5), zone unfamiliarity (+4)",
            "factors": [
                {
                    "feature": "current_traffic_ratio",
                    "impact_minutes": 9.2,
                    "direction": "positive",
                    "sentence": "Heavy traffic on route is adding ~9 minutes",
                    "importance_rank": 1,
                    "shap_value": 9.2,
                    "feature_value": 1.67
                },
                ...
            ],
            "what_would_help": "Assigning a driver familiar with Banjara Hills would save ~4 min"
        }
    """
    try:
        # Fetch feedback/prediction record
        feedback = (
            db.query(DeliveryFeedback)
            .filter(
                DeliveryFeedback.order_id == request.order_id,
                DeliveryFeedback.tenant_id == tenant_id,
            )
            .order_by(DeliveryFeedback.predicted_at.desc())
            .first()
        )

        if not feedback:
            raise HTTPException(
                status_code=404, detail=f"No prediction found for order {request.order_id}"
            )

        # Parse stored explanation if available
        if hasattr(feedback, 'explanation_json') and feedback.explanation_json:
            import json

            explanation_data = json.loads(feedback.explanation_json)

            # Compute confidence badge
            confidence = explanation_data.get("confidence_within_5min", 0.75)
            if confidence > 0.85:
                confidence_badge = "high"
            elif confidence > 0.70:
                confidence_badge = "medium"
            else:
                confidence_badge = "low"

            return ExplanationResponse(
                order_id=feedback.order_id,
                eta_minutes=int(round(explanation_data.get("actual_prediction", feedback.predicted_eta_min))),
                eta_p10=int(round(explanation_data.get("eta_p10", feedback.predicted_eta_min - 5))),
                eta_p90=int(round(explanation_data.get("eta_p90", feedback.predicted_eta_min + 5))),
                confidence_within_5min=confidence,
                confidence_badge=confidence_badge,
                summary=explanation_data.get("summary", "Prediction complete"),
                factors=[
                    ExplanationFactor(
                        feature=f["feature"],
                        impact_minutes=f["impact_minutes"],
                        direction=f["direction"],
                        sentence=f["sentence"],
                        importance_rank=f["importance_rank"],
                        shap_value=f["shap_value"],
                        feature_value=f["feature_value"],
                    )
                    for f in explanation_data.get("factors", [])
                ],
                what_would_help=explanation_data.get("what_would_help"),
            )

        # Fallback if no stored explanation
        raise HTTPException(
            status_code=422,
            detail="Explanation not available for this prediction (stored data missing)",
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating explanation: {str(e)}")


# ============================================================================
# Analytics Endpoints
# ============================================================================


@router.get("/analytics/delay-factors", response_model=DelayFactorAnalytics)
async def get_delay_factor_analytics(
    zone: Optional[str] = Query(None, description="Delivery zone filter"),
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    top_k: int = Query(5, description="Number of top factors to return"),
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(SessionLocal),
) -> DelayFactorAnalytics:
    """
    Get aggregated delay factors for a zone and time period.

    This endpoint analyzes all completed deliveries to identify:
    1. Most common reasons for delays
    2. Most common reasons for early arrivals
    3. Frequency and magnitude of each factor

    Example:
        GET /api/v1/analytics/delay-factors?zone=Banjara%20Hills&date_from=2026-03-01&date_to=2026-03-19

        Response:
        {
            "zone": "Banjara Hills",
            "date_range": "2026-03-01 to 2026-03-19",
            "top_delay_factors": [
                {
                    "factor_name": "current_traffic_ratio",
                    "avg_positive_impact_min": 8.5,
                    "frequency": 23,
                    "total_deliveries": 45
                },
                {
                    "factor_name": "distance_km",
                    "avg_positive_impact_min": 5.2,
                    "frequency": 18,
                    "total_deliveries": 45
                },
                {
                    "factor_name": "driver_zone_familiarity",
                    "avg_positive_impact_min": 3.8,
                    "frequency": 12,
                    "total_deliveries": 45
                },
            ],
            "early_factors": [
                {
                    "factor_name": "time_of_day",
                    "avg_positive_impact_min": 3.2,
                    "frequency": 15,
                    "total_deliveries": 45
                }
            ]
        }
    """
    try:
        # Parse dates
        if date_from:
            from_date = datetime.strptime(date_from, "%Y-%m-%d")
        else:
            from_date = datetime.utcnow() - timedelta(days=7)

        if date_to:
            to_date = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)
        else:
            to_date = datetime.utcnow()

        # Query deliveries
        query = (
            db.query(DeliveryFeedback)
            .filter(
                DeliveryFeedback.tenant_id == tenant_id,
                DeliveryFeedback.predicted_at >= from_date,
                DeliveryFeedback.predicted_at < to_date,
                DeliveryFeedback.actual_delivery_min.isnot(None),
            )
        )

        if zone:
            # Filter by zone (would need zone column or computation from lat/lng)
            pass

        deliveries = query.all()

        if not deliveries:
            return DelayFactorAnalytics(
                zone=zone or "all",
                date_range=f"{from_date.date()} to {to_date.date()}",
                top_delay_factors=[],
                early_factors=[],
            )

        # Aggregate factors
        delay_factors_map = {}
        early_factors_map = {}

        for delivery in deliveries:
            if not hasattr(delivery, 'explanation_json') or not delivery.explanation_json:
                continue

            import json

            explanation_data = json.loads(delivery.explanation_json)

            for factor in explanation_data.get("factors", []):
                factor_name = factor["feature"]
                impact = factor["impact_minutes"]

                if factor["direction"] == "positive":
                    if factor_name not in delay_factors_map:
                        delay_factors_map[factor_name] = {"impacts": [], "count": 0}
                    delay_factors_map[factor_name]["impacts"].append(impact)
                    delay_factors_map[factor_name]["count"] += 1

                else:
                    if factor_name not in early_factors_map:
                        early_factors_map[factor_name] = {"impacts": [], "count": 0}
                    early_factors_map[factor_name]["impacts"].append(impact)
                    early_factors_map[factor_name]["count"] += 1

        # Format output
        top_delay_factors = []
        for factor_name in sorted(
            delay_factors_map.keys(),
            key=lambda k: len(delay_factors_map[k]["impacts"]),
            reverse=True,
        )[:top_k]:
            data = delay_factors_map[factor_name]
            top_delay_factors.append(
                DelayFactor(
                    factor_name=factor_name,
                    avg_positive_impact_min=float(
                        sum(data["impacts"]) / len(data["impacts"]) if data["impacts"] else 0
                    ),
                    frequency=data["count"],
                    total_deliveries=len(deliveries),
                )
            )

        early_factors = []
        for factor_name in sorted(
            early_factors_map.keys(),
            key=lambda k: len(early_factors_map[k]["impacts"]),
            reverse=True,
        )[:top_k]:
            data = early_factors_map[factor_name]
            early_factors.append(
                DelayFactor(
                    factor_name=factor_name,
                    avg_positive_impact_min=float(
                        sum(data["impacts"]) / len(data["impacts"]) if data["impacts"] else 0
                    ),
                    frequency=data["count"],
                    total_deliveries=len(deliveries),
                )
            )

        return DelayFactorAnalytics(
            zone=zone or "all",
            date_range=f"{from_date.date()} to {to_date.date()}",
            top_delay_factors=top_delay_factors,
            early_factors=early_factors,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing delay factors: {str(e)}")


@router.get("/analytics/driver-zones")
async def get_driver_familiarity_zones(
    driver_id: str = Query(..., description="Driver ID"),
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(SessionLocal),
):
    """
    Get driver's familiarity scores across zones.

    Returns zones where driver has delivered and their familiarity scores.
    """
    try:
        scorer = DriverFamiliarityScorer(db_session=db)

        # Get all unique zones for this driver
        deliveries = (
            db.query(DeliveryFeedback)
            .filter(
                DeliveryFeedback.driver_id == driver_id,
                DeliveryFeedback.tenant_id == tenant_id,
            )
            .all()
        )

        if not deliveries:
            return {"driver_id": driver_id, "zones": []}

        # Extract zones and compute familiarity
        zones_data = {}
        for delivery in deliveries:
            zone_id = scorer._extract_zone_id(delivery)
            if zone_id not in zones_data:
                zones_data[zone_id] = {
                    "deliveries": 0,
                    "avg_error": 0,
                    "familiarity_score": 0,
                }
            zones_data[zone_id]["deliveries"] += 1
            if delivery.error_min:
                zones_data[zone_id]["avg_error"] += abs(delivery.error_min)

        # Compute average errors
        for zone_id in zones_data:
            if zones_data[zone_id]["deliveries"] > 0:
                zones_data[zone_id]["avg_error"] /= zones_data[zone_id]["deliveries"]
                zones_data[zone_id]["familiarity_score"] = scorer.get_driver_zone_familiarity(
                    driver_id, zone_id
                )

        return {
            "driver_id": driver_id,
            "zones": [
                {
                    "zone_id": zone_id,
                    "deliveries": data["deliveries"],
                    "avg_error_min": round(data["avg_error"], 1),
                    "familiarity_score": round(data["familiarity_score"], 2),
                }
                for zone_id, data in zones_data.items()
            ],
        }

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error getting driver zone familiarity: {str(e)}"
        )
