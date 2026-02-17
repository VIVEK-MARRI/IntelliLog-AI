from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from src.backend.app.db.base import get_db
from src.backend.app.db.models import Driver
from src.backend.app.schemas import all as schemas
from src.backend.app.api import deps

router = APIRouter()

@router.get("/", response_model=List[schemas.Driver])
def read_drivers(
    db: Session = Depends(deps.get_db_session),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    tenant_id: str = Depends(deps.get_current_tenant),
    status: str = Query(None),
    warehouse_id: str = Query(None),
) -> Any:
    """
    Retrieve drivers with optional filtering.
    
    - **status**: Filter by driver status (offline, available, busy)
    - **warehouse_id**: Filter by assigned warehouse
    """
    try:
        query = db.query(Driver).filter(Driver.tenant_id == tenant_id)
        
        if status:
            query = query.filter(Driver.status == status)
        
        if warehouse_id:
            query = query.filter(Driver.warehouse_id == warehouse_id)
        
        drivers = query.offset(skip).limit(limit).all()
        return drivers
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.post("/", response_model=schemas.Driver)
def create_driver(
    *,
    db: Session = Depends(deps.get_db_session),
    driver_in: schemas.DriverCreate,
    tenant_id: str = Depends(deps.get_current_tenant),
) -> Any:
    """
    Create new driver.
    
    **Required fields:**
    - name: Driver name
    - vehicle_capacity: Vehicle capacity (units)
    """
    try:
        if not driver_in.name or driver_in.name.strip() == "":
            raise HTTPException(status_code=400, detail="Driver name is required")
        
        if driver_in.vehicle_capacity < 0:
            raise HTTPException(status_code=400, detail="Vehicle capacity must be non-negative")
        
        driver = Driver(
            **driver_in.model_dump(),
            tenant_id=tenant_id
        )
        db.add(driver)
        db.commit()
        db.refresh(driver)
        return driver
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid input: {str(e)}")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/{driver_id}", response_model=schemas.Driver)
def read_driver(
    *,
    db: Session = Depends(deps.get_db_session),
    driver_id: str,
    tenant_id: str = Depends(deps.get_current_tenant),
) -> Any:
    """
    Get driver by ID.
    """
    driver = db.query(Driver).filter(Driver.id == driver_id, Driver.tenant_id == tenant_id).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    return driver
