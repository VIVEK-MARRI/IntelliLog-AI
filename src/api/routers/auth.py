"""
Authentication router.
Provides login, refresh, logout, and current-tenant endpoints.
Login uses bcrypt password verification against password_hash column.
Refresh tokens are stored in Redis for revocation support.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.auth import (
    ALGORITHM,
    AuthenticatedTenant,
    _get_secret_key,
    create_access_token,
    create_refresh_token,
    get_current_tenant,
    hash_password,
    is_refresh_token_revoked,
    revoke_refresh_token,
    verify_password,
)
from src.api.deps import get_db
from src.api.rate_limit import check_rate_limit
from src.core.config import get_settings

router = APIRouter(tags=["auth"], prefix="/auth")


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    tenant: dict


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


@router.post("/login")
async def login(
    request: Request,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Authenticate user with email + bcrypt password.
    Returns access_token (15 min) + refresh_token (7 days).
    """
    settings = get_settings(allow_defaults=True)
    await check_rate_limit(request, settings.rate_limit_auth_per_minute, key_prefix="auth")

    if not body.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password is required",
        )

    result = await db.execute(
        text("""
            SELECT id, name, email, password_hash, is_active
            FROM tenants
            WHERE email = :email
            LIMIT 1
        """),
        {"email": body.email},
    )
    row = result.mappings().one_or_none()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if not row["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is inactive",
        )

    stored_hash = row["password_hash"]
    if not stored_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Password not set. Please use password reset.",
        )

    if not verify_password(body.password, stored_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    tenant = AuthenticatedTenant(
        tenant_id=str(row["id"]),
        name=row["name"],
        is_active=True,
    )

    access_token = create_access_token(tenant_id=tenant.tenant_id, name=tenant.name)
    refresh_token, _ = await create_refresh_token(tenant_id=tenant.tenant_id, name=tenant.name)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "tenant": tenant.model_dump(),
    }


@router.post("/refresh")
async def refresh(
    request: Request,
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Exchange a valid refresh token for a new access + refresh token pair.
    The old refresh token is revoked on use (rotation).
    """
    secret = _get_secret_key()

    try:
        payload = jwt.decode(body.refresh_token, secret, algorithms=[ALGORITHM])
        token_type = payload.get("type")
        if token_type != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
            )
        jti = payload.get("jti")
        tenant_id = payload.get("sub")
        tenant_name = payload.get("name")

        if not jti or not tenant_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    # Check if revoked
    if await is_refresh_token_revoked(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked",
        )

    # Revoke old token (rotation)
    await revoke_refresh_token(jti)

    # Verify tenant still exists and is active
    result = await db.execute(
        text("SELECT is_active FROM tenants WHERE id = :tenant_id"),
        {"tenant_id": tenant_id},
    )
    row = result.one_or_none()
    if row is None or not row[0]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tenant not found or inactive",
        )

    new_access = create_access_token(tenant_id=tenant_id, name=tenant_name or "Unknown")
    new_refresh, _ = await create_refresh_token(tenant_id=tenant_id, name=tenant_name or "Unknown")

    return {
        "access_token": new_access,
        "refresh_token": new_refresh,
    }


@router.post("/logout")
async def logout(
    request: Request,
    body: LogoutRequest,
) -> dict:
    """
    Logout by revoking the refresh token.
    The access token will expire naturally (15 min TTL).
    """
    secret = _get_secret_key()

    try:
        payload = jwt.decode(body.refresh_token, secret, algorithms=[ALGORITHM])
        jti = payload.get("jti")
        token_type = payload.get("type")
        if not jti or token_type != "refresh":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid refresh token",
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid refresh token",
        )

    await revoke_refresh_token(jti)
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=AuthenticatedTenant)
async def me(
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
) -> AuthenticatedTenant:
    """Return tenant resolved from bearer token."""
    return current_tenant
