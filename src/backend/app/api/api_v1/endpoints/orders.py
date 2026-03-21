from datetime import datetime
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from pydantic import BaseModel, Field

from src.backend.app.db.models import DeliveryFeedback, Order, Tenant
from src.backend.app.schemas import all as schemas
from src.backend.app.api import deps
from src.backend.app.core.validators import ensure_uuid4
from src.backend.app.services.warehouse_service import assign_order_to_warehouse

router = APIRouter()


class OrderCompleteRequest(BaseModel):
    actual_delivery_minutes: Optional[float] = None


class OrderCreateCompat(BaseModel):
    order_number: Optional[str] = None
    customer_name: Optional[str] = None
    delivery_address: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    delivery_lat: Optional[float] = Field(default=None)
    delivery_lon: Optional[float] = Field(default=None)
    weight: float = 1.0
    time_window_start: Optional[datetime] = None
    time_window_end: Optional[datetime] = None
    status: str = "pending"
    warehouse_id: Optional[str] = None
    tenant_id: Optional[str] = None


def _get_time_of_day_bucket(dt: datetime) -> str:
    hour = dt.hour
    if 6 <= hour < 12:
        return "morning"
    elif 12 <= hour < 17:
        return "afternoon"
    elif 17 <= hour < 21:
        return "evening"
    else:
        return "night"


def _enqueue_delivery_feedback_task(**kwargs: Any) -> None:
    """Import and dispatch feedback task lazily to avoid import side effects at module load."""
    from src.ml.continuous_learning.celery_tasks import record_delivery_feedback_task

    record_delivery_feedback_task.delay(**kwargs)


def _estimate_eta_minutes(lat: float, lng: float, weight: float) -> float:
    # Lightweight deterministic ETA estimate for immediate API response.
    base = 18.0
    distance_component = abs(lat - 17.44) * 120 + abs(lng - 78.44) * 95
    weight_component = max(0.0, weight - 1.0) * 0.8
    return round(base + distance_component + weight_component, 1)

@router.get("", response_model=List[schemas.Order])
@router.get("/", response_model=List[schemas.Order], include_in_schema=False)
def read_orders(
    db: Session = Depends(deps.get_db_session),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    tenant_id: str = Depends(deps.get_current_tenant),
    warehouse_id: str = Query(None),
    status: str = Query(None),
) -> Any:
    """
    Retrieve orders with optional filtering.
    
    - **skip**: Number of orders to skip (pagination)
    - **limit**: Maximum number of orders to return
    - **warehouse_id**: Filter by warehouse
    - **status**: Filter by order status (pending, assigned, delivered, failed)
    """
    try:
        query = db.query(Order).filter(Order.tenant_id == tenant_id)
        
        if warehouse_id:
            query = query.filter(Order.warehouse_id == warehouse_id)
        
        if status:
            query = query.filter(Order.status == status)
        
        orders = query.offset(skip).limit(limit).all()
        return orders
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.post("", response_model=schemas.Order)
@router.post("/", response_model=schemas.Order, include_in_schema=False)
def create_order(
    *,
    db: Session = Depends(deps.get_db_session),
    order_in: OrderCreateCompat,
    tenant_id: str = Depends(deps.get_current_tenant),
) -> Any:
    """
    Create new order or update if exists (upsert).
    Auto-assigns to nearest warehouse if not specified.
    
    **Required fields:**
    - order_number: Unique order identifier
    - delivery_address: Delivery location
    - lat, lng: Delivery coordinates
    """
    try:
        lat = order_in.lat if order_in.lat is not None else order_in.delivery_lat
        lng = order_in.lng if order_in.lng is not None else order_in.delivery_lon
        if lat is None or lng is None:
            raise HTTPException(status_code=400, detail="Either lat/lng or delivery_lat/delivery_lon is required")

        # Validate coordinates
        if not (-90 <= lat <= 90):
            raise HTTPException(status_code=400, detail="Invalid latitude (-90 to 90)")
        if not (-180 <= lng <= 180):
            raise HTTPException(status_code=400, detail="Invalid longitude (-180 to 180)")

        resolved_order_number = order_in.order_number or f"ORD-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')[-12:]}"
        resolved_tenant_id = order_in.tenant_id or tenant_id

        existing_tenant = db.query(Tenant).filter(Tenant.id == resolved_tenant_id).first()
        if not existing_tenant:
            db.add(
                Tenant(
                    id=resolved_tenant_id,
                    name="Demo Tenant",
                    slug=resolved_tenant_id,
                    plan="demo",
                )
            )
            db.commit()

        payload = {
            "order_number": resolved_order_number,
            "customer_name": order_in.customer_name,
            "delivery_address": order_in.delivery_address,
            "lat": lat,
            "lng": lng,
            "weight": order_in.weight,
            "time_window_start": order_in.time_window_start,
            "time_window_end": order_in.time_window_end,
            "status": order_in.status,
            "warehouse_id": order_in.warehouse_id,
        }
        
        # Check if order with this order_number already exists
        existing_order = db.query(Order).filter(
            Order.order_number == resolved_order_number,
            Order.tenant_id == resolved_tenant_id
        ).first()
        
        if existing_order:
            # Update existing order
            for key, value in payload.items():
                setattr(existing_order, key, value)
            # Auto-assign warehouse if not set
            if not existing_order.warehouse_id:
                assign_order_to_warehouse(db, existing_order)
            db.commit()
            db.refresh(existing_order)
            setattr(existing_order, "predicted_eta_minutes", _estimate_eta_minutes(lat, lng, order_in.weight))
            return existing_order
        else:
            # Create new order
            order = Order(
                **payload,
                tenant_id=resolved_tenant_id
            )
            # Auto-assign to nearest warehouse
            if not order.warehouse_id:
                assign_order_to_warehouse(db, order)
            db.add(order)
            db.commit()
            db.refresh(order)
            setattr(order, "predicted_eta_minutes", _estimate_eta_minutes(lat, lng, order_in.weight))
            return order
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid input: {str(e)}")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/{order_id}", response_model=schemas.Order)
def read_order(
    *,
    db: Session = Depends(deps.get_db_session),
    order_id: str,
    tenant_id: str = Depends(deps.get_current_tenant),
) -> Any:
    """
    Get order by ID.
    """
    ensure_uuid4(order_id, "order_id")
    order = db.query(Order).filter(Order.id == order_id, Order.tenant_id == tenant_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.post("/{order_id}/complete", response_model=schemas.Order)
def complete_order(
    *,
    db: Session = Depends(deps.get_db_session),
    order_id: str,
    payload: OrderCompleteRequest,
    tenant_id: str = Depends(deps.get_current_tenant),
) -> Any:
    """Mark an order as delivered and emit delivery feedback for continuous learning."""
    ensure_uuid4(order_id, "order_id")

    order = db.query(Order).filter(Order.id == order_id, Order.tenant_id == tenant_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    order.status = "delivered"
    db.add(order)
    db.commit()
    db.refresh(order)

    actual_delivery_minutes = payload.actual_delivery_minutes

    latest_feedback = (
        db.query(DeliveryFeedback)
        .filter(
            DeliveryFeedback.order_id == str(order.id),
            DeliveryFeedback.tenant_id == str(tenant_id),
        )
        .order_by(DeliveryFeedback.predicted_at.desc())
        .first()
    )

    predicted_eta_minutes = None
    prediction_model_version = "unknown"
    if latest_feedback:
        predicted_eta_minutes = latest_feedback.predicted_eta_min
        prediction_model_version = latest_feedback.prediction_model_version or "unknown"
    elif getattr(order, "lat", None) is not None and getattr(order, "lng", None) is not None:
        predicted_eta_minutes = _estimate_eta_minutes(float(order.lat), float(order.lng), float(order.weight or 1.0))
        prediction_model_version = "order_create_estimate"

    # Persist feedback synchronously so manual verification works even without workers.
    if predicted_eta_minutes is not None and actual_delivery_minutes is not None:
        now_dt = datetime.now()
        feedback_row = latest_feedback if latest_feedback else DeliveryFeedback(
            tenant_id=str(tenant_id),
            order_id=str(order.id),
            driver_id=str(order.driver_id) if getattr(order, "driver_id", None) else None,
            prediction_model_version=prediction_model_version,
            predicted_eta_min=float(predicted_eta_minutes),
            traffic_condition=getattr(order, "traffic_condition", None),
            weather=getattr(order, "weather_condition", None),
            vehicle_type=getattr(order, "vehicle_type", None),
            distance_km=float(order.distance_km) if getattr(order, "distance_km", None) else None,
            time_of_day=_get_time_of_day_bucket(now_dt),
            day_of_week=now_dt.weekday(),
            predicted_at=now_dt,
        )
        feedback_row.actual_delivery_min = float(actual_delivery_minutes)
        feedback_row.error_min = float(actual_delivery_minutes) - float(predicted_eta_minutes)
        feedback_row.delivered_at = now_dt
        db.add(feedback_row)
        db.commit()

    # Dispatch feedback task only if BOTH predicted and actual exist.
    # Use explicit is not None checks: predicted_eta_minutes can be 0.0 (same-building delivery)
    if predicted_eta_minutes is not None and actual_delivery_minutes is not None:
        now_dt = datetime.now()
        try:
            _enqueue_delivery_feedback_task(
                order_id=str(order.id),
                tenant_id=str(tenant_id),
                predicted_eta_min=float(predicted_eta_minutes),
                actual_delivery_min=float(actual_delivery_minutes),
                error_min=float(actual_delivery_minutes) - float(predicted_eta_minutes),
                prediction_model_version=prediction_model_version,
                driver_id=str(order.driver_id) if getattr(order, "driver_id", None) else None,
                traffic_condition=getattr(order, "traffic_condition", None),
                weather=getattr(order, "weather_condition", None),
                vehicle_type=getattr(order, "vehicle_type", None),
                distance_km=float(order.distance_km) if getattr(order, "distance_km", None) else None,
                time_of_day=_get_time_of_day_bucket(now_dt),
                day_of_week=now_dt.weekday(),
            )
        except Exception:
            # Keep completion API successful when worker/broker is unavailable.
            pass

    return order
