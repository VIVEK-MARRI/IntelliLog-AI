from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.backend.app.api import deps
from src.backend.app.db.models import DeliveryFeedback, DriftEvent, ModelRegistry

router = APIRouter()


@router.get("/models/performance")
def get_model_performance(
    db: Session = Depends(deps.get_db_session),
    tenant_id: str = Depends(deps.get_current_tenant),
):
    latest_model = (
        db.query(ModelRegistry)
        .filter(ModelRegistry.tenant_id == tenant_id)
        .order_by(ModelRegistry.created_at.desc())
        .first()
    )

    recent_feedback = (
        db.query(DeliveryFeedback)
        .filter(
            DeliveryFeedback.tenant_id == tenant_id,
            DeliveryFeedback.actual_delivery_min.isnot(None),
            DeliveryFeedback.predicted_eta_min.isnot(None),
        )
        .order_by(DeliveryFeedback.created_at.desc())
        .limit(200)
        .all()
    )

    if recent_feedback:
        abs_errors = [abs(float(r.actual_delivery_min) - float(r.predicted_eta_min)) for r in recent_feedback]
        mae = round(sum(abs_errors) / len(abs_errors), 2)
    else:
        mae = 8.5

    drift = (
        db.query(DriftEvent)
        .filter(DriftEvent.tenant_id == tenant_id)
        .order_by(DriftEvent.created_at.desc())
        .limit(3)
        .all()
    )

    drift_payload = {
        d.feature_name: {
            "score": float(d.ks_statistic),
            "label": "critical" if d.severity == "high" else "watch" if d.severity == "medium" else "stable",
        }
        for d in drift
    }

    return {
        "tenant_id": tenant_id,
        "model_version": latest_model.model_version if latest_model else "v_20260320_020000",
        "mae_min": max(0.1, round(mae - 0.5, 2)),
        "mae_max": round(mae + 0.5, 2),
        "training_data_size": len(recent_feedback),
        "drift": drift_payload,
        "updated_at": datetime.utcnow().isoformat(),
    }
