"""
Warehouse CRUD API endpoints.

Provides REST endpoints for warehouse management including
listing, creating, and querying warehouse details with
associated orders and drivers.
"""

from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.backend.app.db.models import Warehouse, Order, Driver
from src.backend.app.schemas import all as schemas
from src.backend.app.api import deps
from src.backend.app.services.warehouse_service import get_warehouse_stats

router = APIRouter()


@router.get("/", response_model=List[schemas.Warehouse])
def list_warehouses(
    db: Session = Depends(deps.get_db_session),
    tenant_id: str = Depends(deps.get_current_tenant),
) -> Any:
    """List all warehouses for the current tenant."""
    return (
        db.query(Warehouse)
        .filter(Warehouse.tenant_id == tenant_id)
        .all()
    )


@router.post("/", response_model=schemas.Warehouse)
def create_warehouse(
    *,
    db: Session = Depends(deps.get_db_session),
    warehouse_in: schemas.WarehouseCreate,
    tenant_id: str = Depends(deps.get_current_tenant),
) -> Any:
    """Create a new warehouse."""
    warehouse = Warehouse(
        **warehouse_in.model_dump(),
        tenant_id=tenant_id,
    )
    db.add(warehouse)
    db.commit()
    db.refresh(warehouse)
    return warehouse


@router.get("/{warehouse_id}", response_model=schemas.Warehouse)
def get_warehouse(
    warehouse_id: str,
    db: Session = Depends(deps.get_db_session),
    tenant_id: str = Depends(deps.get_current_tenant),
) -> Any:
    """Get warehouse by ID."""
    wh = (
        db.query(Warehouse)
        .filter(Warehouse.id == warehouse_id, Warehouse.tenant_id == tenant_id)
        .first()
    )
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    return wh


@router.get("/{warehouse_id}/stats")
def warehouse_stats(
    warehouse_id: str,
    db: Session = Depends(deps.get_db_session),
    tenant_id: str = Depends(deps.get_current_tenant),
) -> Any:
    """Get warehouse statistics (order/driver counts)."""
    wh = (
        db.query(Warehouse)
        .filter(Warehouse.id == warehouse_id, Warehouse.tenant_id == tenant_id)
        .first()
    )
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    return get_warehouse_stats(db, warehouse_id)


@router.get("/{warehouse_id}/orders", response_model=List[schemas.Order])
def warehouse_orders(
    warehouse_id: str,
    db: Session = Depends(deps.get_db_session),
    tenant_id: str = Depends(deps.get_current_tenant),
    status: str = None,
) -> Any:
    """List orders assigned to a warehouse."""
    query = db.query(Order).filter(
        Order.warehouse_id == warehouse_id,
        Order.tenant_id == tenant_id,
    )
    if status:
        query = query.filter(Order.status == status)
    return query.all()


@router.get("/{warehouse_id}/drivers", response_model=List[schemas.Driver])
def warehouse_drivers(
    warehouse_id: str,
    db: Session = Depends(deps.get_db_session),
    tenant_id: str = Depends(deps.get_current_tenant),
) -> Any:
    """List drivers assigned to a warehouse."""
    return (
        db.query(Driver)
        .filter(Driver.warehouse_id == warehouse_id, Driver.tenant_id == tenant_id)
        .all()
    )
