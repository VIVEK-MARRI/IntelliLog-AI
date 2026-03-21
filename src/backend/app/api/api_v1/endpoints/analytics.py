from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.backend.app.api import deps
from src.backend.app.db.models import DeliveryFeedback, Driver

router = APIRouter()


@router.get("/delay-factors")
def get_delay_factors(
    db: Session = Depends(deps.get_db_session),
    tenant_id: str = Depends(deps.get_current_tenant),
):
    rows = (
        db.query(DeliveryFeedback)
        .filter(DeliveryFeedback.tenant_id == tenant_id)
        .order_by(DeliveryFeedback.predicted_at.desc())
        .limit(500)
        .all()
    )

    traffic_samples = [float(r.error_min) for r in rows if r.error_min is not None and r.traffic_condition]
    weather_samples = [float(r.error_min) for r in rows if r.error_min is not None and r.weather]
    distance_samples = [float(r.error_min) for r in rows if r.error_min is not None and r.distance_km is not None]

    def avg(values):
        return round(sum(values) / len(values), 2) if values else 0.0

    return {
        "date": datetime.utcnow().date().isoformat(),
        "factors": [
            {"feature": "traffic_deviation", "impact_min": abs(avg(traffic_samples)) or 4.0},
            {"feature": "weather", "impact_min": abs(avg(weather_samples)) or 2.0},
            {"feature": "distance_km", "impact_min": abs(avg(distance_samples)) or 1.5},
        ],
    }


@router.get("/driver-zones")
def get_driver_zones(
    db: Session = Depends(deps.get_db_session),
    tenant_id: str = Depends(deps.get_current_tenant),
):
    drivers = db.query(Driver).filter(Driver.tenant_id == tenant_id).all()
    payload = []
    for driver in drivers:
        zones = driver.zone_expertise or []
        payload.append(
            {
                "driver_id": driver.id,
                "driver_name": driver.name,
                "vehicle_type": driver.vehicle_type,
                "zones": zones,
                "zone_count": len(zones),
            }
        )
    return {"tenant_id": tenant_id, "drivers": payload}
