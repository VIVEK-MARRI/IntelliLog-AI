from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.backend.app.core.auth import AuthenticatedPrincipal
from src.backend.app.db.base import get_db
from src.backend.app.db.models import Tenant
from src.backend.app.schemas import all as schemas
from src.backend.app.api import deps

router = APIRouter()

@router.get("/", response_model=List[schemas.Tenant])
def read_tenants(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: AuthenticatedPrincipal = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve tenants.
    """
    tenants = db.query(Tenant).filter(Tenant.id == current_user.tenant_id).offset(skip).limit(limit).all()
    return tenants

@router.post("/", response_model=schemas.Tenant)
def create_tenant(
    *,
    db: Session = Depends(get_db),
    tenant_in: schemas.TenantCreate,
    current_user: AuthenticatedPrincipal = Depends(deps.get_current_user),
) -> Any:
    """
    Create new tenant.
    """
    if current_user.role not in {"admin", "manager"}:
        raise HTTPException(status_code=403, detail="Insufficient role")

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
