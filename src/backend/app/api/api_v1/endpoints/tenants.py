from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.backend.app.db.base import get_db
from src.backend.app.db.models import Tenant
from src.backend.app.schemas import all as schemas

router = APIRouter()

@router.get("/", response_model=List[schemas.Tenant])
def read_tenants(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
) -> Any:
    """
    Retrieve tenants.
    """
    tenants = db.query(Tenant).offset(skip).limit(limit).all()
    return tenants

@router.post("/", response_model=schemas.Tenant)
def create_tenant(
    *,
    db: Session = Depends(get_db),
    tenant_in: schemas.TenantCreate,
) -> Any:
    """
    Create new tenant.
    """
    tenant = db.query(Tenant).filter(Tenant.slug == tenant_in.slug).first()
    if tenant:
        raise HTTPException(
            status_code=400,
            detail="The tenant with this slug already exists in the system",
        )
    tenant = Tenant(name=tenant_in.name, slug=tenant_in.slug, plan=tenant_in.plan)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return tenant
