from typing import Generator
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from src.backend.app.db.base import SessionLocal

def get_db_session() -> Generator:
    """Dependency to get DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Variable to hold the current tenant for the request context if needed
# In a real implementation, we would extract this from the JWT or Subdomain
def get_current_tenant(db: Session = Depends(get_db_session)):
    """
    Placeholder for Tenant Dependency.
    In production, this would parse the JWT token or Host header to fetch the Tenant.
    """
    # For now, return None or raising generic error if no auth is present
    # MOCK: Return default tenant
    # In real app, query DB for tenant with slug="default" or similar
    return "default"

def get_current_user():
    """
    Mock dependency to return a default 'admin' user.
    """
    return {
        "id": "1",
        "email": "admin@example.com",
        "full_name": "System Admin",
        "role": "admin",
        "is_superuser": True,
        "tenant_id": "default"
    }

def get_current_active_user(current_user = Depends(get_current_user)):
    """
    Mock dependency to bypass active user check.
    """
    return current_user
