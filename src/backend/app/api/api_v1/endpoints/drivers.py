from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.backend.app.db.base import get_db
from src.backend.app.db.models import Driver
from src.backend.app.schemas import all as schemas
from src.backend.app.api import deps

router = APIRouter()

@router.get("/", response_model=List[schemas.Driver])
def read_drivers(
    db: Session = Depends(deps.get_db_session),
    skip: int = 0,
    limit: int = 100,
    tenant_id: str = Depends(deps.get_current_tenant),
) -> Any:
    """
    Retrieve drivers.
    """
    # Filter by tenant_id
    drivers = db.query(Driver).filter(Driver.tenant_id == tenant_id).offset(skip).limit(limit).all()
    return drivers

@router.post("/", response_model=schemas.Driver)
def create_driver(
    *,
    db: Session = Depends(deps.get_db_session),
    driver_in: schemas.DriverCreate,
    tenant_id: str = Depends(deps.get_current_tenant),
) -> Any:
    """
    Create new driver.
    """
    driver = Driver(
        **driver_in.model_dump(),
        tenant_id=tenant_id
    )
    db.add(driver)
    db.commit()
    db.refresh(driver)
    return driver

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
