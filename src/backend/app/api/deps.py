from typing import Generator

from fastapi import Depends

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


def get_current_tenant(current_user: AuthenticatedPrincipal = Depends(auth_get_current_user)) -> str:
    """Tenant resolver derived from authenticated principal."""
    return current_user.tenant_id


def get_current_active_user(current_user: AuthenticatedPrincipal = Depends(auth_get_current_user)) -> AuthenticatedPrincipal:
    """Compatibility alias for active authenticated principal."""
    return current_user
