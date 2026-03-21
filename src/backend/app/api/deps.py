from typing import Generator, Optional

from fastapi import Depends, Header, Query, Request
from sqlalchemy.orm import Session

from src.backend.app.core.auth import AuthenticatedPrincipal, get_current_user as auth_get_current_user
from src.backend.app.db.base import SessionLocal

def get_db_session() -> Generator:
    """Dependency to get DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_user(current_user: AuthenticatedPrincipal = Depends(auth_get_current_user)) -> AuthenticatedPrincipal:
    """Return authenticated principal from core auth dependency."""
    return current_user


def get_optional_user(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db_session),
) -> Optional[AuthenticatedPrincipal]:
    """Resolve user if Authorization exists; otherwise return None for demo-compatible flows."""
    if not authorization:
        return None
    try:
        return auth_get_current_user(request=request, authorization=authorization, db=db)
    except Exception:
        return None


def get_current_tenant(
    request: Request,
    tenant_id_query: Optional[str] = Query(default=None, alias="tenant_id"),
    tenant_id_header: Optional[str] = Header(default=None, alias="X-Tenant-ID"),
    current_user: Optional[AuthenticatedPrincipal] = Depends(get_optional_user),
) -> str:
    """Resolve tenant from auth when available, then header/query, then safe demo default."""
    if current_user and current_user.tenant_id:
        return current_user.tenant_id
    if tenant_id_header:
        return tenant_id_header
    if tenant_id_query:
        return tenant_id_query
    body_tenant = None
    if request.method in {"POST", "PUT", "PATCH"}:
        # Avoid consuming body stream here; rely on query/header/default for write calls.
        body_tenant = None
    return body_tenant or "demo-tenant-001"


def get_current_active_user(current_user: AuthenticatedPrincipal = Depends(auth_get_current_user)) -> AuthenticatedPrincipal:
    """Compatibility alias for active authenticated principal."""
    return current_user
