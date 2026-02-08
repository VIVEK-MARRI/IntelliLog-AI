from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.backend.app.db.base import get_db
from src.backend.app.db.models import Order
from src.backend.app.schemas import all as schemas
from src.backend.app.api import deps

router = APIRouter()

@router.get("/", response_model=List[schemas.Order])
def read_orders(
    db: Session = Depends(deps.get_db_session),
    skip: int = 0,
    limit: int = 100,
    tenant_id: str = Depends(deps.get_current_tenant),
) -> Any:
    """
    Retrieve orders.
    """
    orders = db.query(Order).filter(Order.tenant_id == tenant_id).offset(skip).limit(limit).all()
    return orders

@router.post("/", response_model=schemas.Order)
def create_order(
    *,
    db: Session = Depends(deps.get_db_session),
    order_in: schemas.OrderCreate,
    tenant_id: str = Depends(deps.get_current_tenant),
) -> Any:
    """
    Create new order.
    """
    order = Order(
        **order_in.model_dump(),
        tenant_id=tenant_id
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order

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
        raise HTTPException(status_code=444, detail="Order not found")
    return order
