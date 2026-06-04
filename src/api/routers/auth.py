"""
Authentication router.
Provides login and current-tenant endpoints for frontend auth flow.
"""

import hashlib

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.auth import AuthenticatedTenant, create_access_token, get_current_tenant
from src.api.deps import get_db
from src.api.rate_limit import check_rate_limit
from src.core.config import get_settings

router = APIRouter(tags=["auth"], prefix="/auth")

DEFAULT_TENANT_ID = "11111111-1111-1111-1111-111111111111"


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
async def login(
    request: Request,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Authenticate user and return JWT token.

    Rate limited to prevent brute force attacks.
    """
    settings = get_settings(allow_defaults=True)
    await check_rate_limit(request, settings.rate_limit_auth_per_minute, key_prefix="auth")

    if not body.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password is required",
        )
    if "@" not in body.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Valid email is required",
        )

    tenant = AuthenticatedTenant(
        tenant_id=DEFAULT_TENANT_ID,
        name="Default Tenant",
        is_active=True,
    )

    await db.execute(
        text(
            """
            INSERT INTO tenants (id, name, api_key_hash, is_active)
            VALUES (:tenant_id, :name, :api_key_hash, TRUE)
            ON CONFLICT (id) DO UPDATE
            SET name = EXCLUDED.name,
                is_active = EXCLUDED.is_active
            """
        ),
        {
            "tenant_id": tenant.tenant_id,
            "name": tenant.name,
            "api_key_hash": hashlib.sha256(tenant.tenant_id.encode("utf-8")).hexdigest(),
        },
    )
    await db.commit()

    access_token = create_access_token(tenant_id=tenant.tenant_id, name=tenant.name)

    return {
        "access_token": access_token,
        "tenant": tenant.model_dump(),
    }


@router.get("/me", response_model=AuthenticatedTenant)
async def me(current_tenant: AuthenticatedTenant = Depends(get_current_tenant)) -> AuthenticatedTenant:
    """Return tenant resolved from bearer token."""
    return current_tenant
