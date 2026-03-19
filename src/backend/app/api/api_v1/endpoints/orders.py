from datetime import datetime
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from src.backend.app.db.base import get_db
from pydantic import BaseModel

from src.backend.app.db.models import DeliveryFeedback, Order
from src.backend.app.schemas import all as schemas
from src.backend.app.api import deps
from src.backend.app.core.validators import ensure_uuid4
from src.backend.app.services.warehouse_service import assign_order_to_warehouse

router = APIRouter()


class OrderCompleteRequest(BaseModel):
    actual_delivery_minutes: Optional[float] = None


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

@router.get("/", response_model=List[schemas.Order])
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

@router.post("/", response_model=schemas.Order)
def create_order(
    *,
    db: Session = Depends(deps.get_db_session),
    order_in: schemas.OrderCreate,
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
        # Validate coordinates
        if not (-90 <= order_in.lat <= 90):
            raise HTTPException(status_code=400, detail="Invalid latitude (-90 to 90)")
        if not (-180 <= order_in.lng <= 180):
            raise HTTPException(status_code=400, detail="Invalid longitude (-180 to 180)")
        
        # Check if order with this order_number already exists
        existing_order = db.query(Order).filter(
            Order.order_number == order_in.order_number,
            Order.tenant_id == tenant_id
        ).first()
        
        if existing_order:
            # Update existing order
            for key, value in order_in.model_dump().items():
                setattr(existing_order, key, value)
            # Auto-assign warehouse if not set
            if not existing_order.warehouse_id:
                assign_order_to_warehouse(db, existing_order)
            db.commit()
            db.refresh(existing_order)
            return existing_order
        else:
            # Create new order
            order = Order(
                **order_in.model_dump(),
                tenant_id=tenant_id
            )
            # Auto-assign to nearest warehouse
            if not order.warehouse_id:
                assign_order_to_warehouse(db, order)
            db.add(order)
            db.commit()
            db.refresh(order)
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
    current_user = Depends(deps.get_current_user),
) -> Any:
    """Mark an order as delivered and emit delivery feedback for continuous learning."""
    ensure_uuid4(order_id, "order_id")

    order = db.query(Order).filter(Order.id == order_id, Order.tenant_id == current_user.tenant_id).first()
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
            DeliveryFeedback.tenant_id == str(current_user.tenant_id),
        )
        .order_by(DeliveryFeedback.predicted_at.desc())
        .first()
    )

    predicted_eta_minutes = None
    prediction_model_version = "unknown"
    if latest_feedback:
        predicted_eta_minutes = latest_feedback.predicted_eta_min
        prediction_model_version = latest_feedback.prediction_model_version or "unknown"

    # Dispatch feedback task only if BOTH predicted and actual exist.
    # Use explicit is not None checks: predicted_eta_minutes can be 0.0 (same-building delivery)
    if predicted_eta_minutes is not None and actual_delivery_minutes is not None:
        now_dt = datetime.now()
        _enqueue_delivery_feedback_task(
            order_id=str(order.id),
            tenant_id=str(current_user.tenant_id),
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

    return order
