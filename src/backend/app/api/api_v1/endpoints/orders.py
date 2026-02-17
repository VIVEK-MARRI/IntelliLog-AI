from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from src.backend.app.db.base import get_db
from src.backend.app.db.models import Order
from src.backend.app.schemas import all as schemas
from src.backend.app.api import deps
from src.backend.app.services.warehouse_service import assign_order_to_warehouse

router = APIRouter()

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
    order = db.query(Order).filter(Order.id == order_id, Order.tenant_id == tenant_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order
