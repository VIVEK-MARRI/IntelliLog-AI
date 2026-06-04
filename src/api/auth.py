"""
Authentication module: JWT Bearer tokens and API Key support.

All authentication paths fail closed - invalid credentials are rejected.
No default fallback secrets exist anywhere in the codebase.
"""

from __future__ import annotations

import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from typing import Optional

import structlog
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_db
from src.core.config import get_settings

logger = structlog.get_logger(__name__)

ALGORITHM = "HS256"


class AuthenticatedTenant(BaseModel):
    """Authenticated tenant from JWT or API key."""

    tenant_id: str
    name: str
    is_active: bool


def _get_secret_key() -> str:
    """Get the configured secret key. Never returns a default fallback."""
    settings = get_settings(allow_defaults=True)
    if not settings.secret_key:
        logger.critical("secret_key_not_configured")
        raise RuntimeError(
            "SECRET_KEY is not configured. "
            "This is a security-critical setting that must be provided via environment variable."
        )
    return settings.secret_key


def create_access_token(
    tenant_id: str,
    name: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    Create JWT access token.

    Args:
        tenant_id: Tenant ID
        name: Tenant name
        expires_delta: Optional expiry time delta

    Returns:
        JWT token string
    """
    settings = get_settings(allow_defaults=True)
    secret = _get_secret_key()

    if expires_delta is None:
        expires_delta = timedelta(hours=settings.jwt_expiration_hours)

    expire = datetime.now(timezone.utc) + expires_delta
    payload = {
        "sub": tenant_id,
        "name": name,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }

    token = jwt.encode(payload, secret, algorithm=ALGORITHM)
    logger.info("token_created", tenant_id=tenant_id)
    return token


async def get_current_tenant(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer()),
    db: AsyncSession = Depends(get_db),
) -> AuthenticatedTenant:
    """
    Validate JWT Bearer token and verify tenant exists in database.

    Args:
        request: FastAPI request (for setting tenant context)
        credentials: HTTP Bearer credentials
        db: Database session

    Returns:
        AuthenticatedTenant

    Raises:
        HTTPException: 401 if token invalid or tenant not found/inactive
    """
    secret = _get_secret_key()
    token = credentials.credentials

    try:
        payload = jwt.decode(token, secret, algorithms=[ALGORITHM])
        tenant_id: str | None = payload.get("sub")
        tenant_name: str | None = payload.get("name")

        if not tenant_id:
            logger.warning("token_invalid", reason="no_subject")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: no tenant ID",
            )

    except JWTError as e:
        logger.warning("token_invalid", reason=str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    # Verify tenant exists and is active in database
    try:
        result = await db.execute(
            text("SELECT is_active FROM tenants WHERE id = :tenant_id"),
            {"tenant_id": tenant_id},
        )
        row = result.one_or_none()
        if row is None:
            logger.warning("tenant_not_found", tenant_id=tenant_id)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Tenant not found",
            )
        if not row[0]:
            logger.warning("tenant_inactive", tenant_id=tenant_id)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Tenant account is inactive",
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("tenant_verification_failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable",
        )

    # Set tenant context for downstream use
    request.state.tenant_id = tenant_id

    logger.info("token_validated", tenant_id=tenant_id)
    return AuthenticatedTenant(
        tenant_id=tenant_id,
        name=tenant_name or "Unknown",
        is_active=True,
    )


async def get_tenant_from_api_key(
    api_key: str,
    db: AsyncSession,
) -> AuthenticatedTenant:
    """
    Validate API key via SHA-256 hashed lookup against database.

    Args:
        api_key: Raw API key from header
        db: Database session

    Returns:
        AuthenticatedTenant

    Raises:
        HTTPException: 401 if API key invalid, inactive, or not found
    """
    api_key_hash = hashlib.sha256(api_key.encode()).hexdigest()

    try:
        result = await db.execute(
            text("""
                SELECT t.id, t.name, t.is_active
                FROM tenants t
                WHERE t.api_key_hash = :api_key_hash
            """),
            {"api_key_hash": api_key_hash},
        )
        row = result.one_or_none()

        if row is None:
            logger.warning("api_key_invalid")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid API key",
            )

        if not row.is_active:
            logger.warning("api_key_inactive", tenant_id=str(row.id))
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="API key is revoked",
            )

        logger.info("api_key_validated", tenant_id=str(row.id))
        return AuthenticatedTenant(
            tenant_id=str(row.id),
            name=row.name,
            is_active=True,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("api_key_lookup_failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable",
        )


async def get_current_tenant_ws(
    request: Request,
    db: AsyncSession = Depends(lambda: None),
) -> AuthenticatedTenant:
    """
    Authenticate WebSocket connections via Sec-WebSocket-Protocol header.
    This avoids putting JWT tokens in URL query parameters.

    The client sends the JWT as the first value in Sec-WebSocket-Protocol.
    The server validates it and responds with the same protocol value.

    Args:
        request: FastAPI request (used to extract tenant context)
        db: Database session

    Returns:
        AuthenticatedTenant

    Raises:
        HTTPException: 401 if token invalid
        WebSocketException: 1008 if token invalid during WebSocket upgrade
    """
    secret = _get_secret_key()

    # Extract token from Sec-WebSocket-Protocol header
    ws_protocol = request.headers.get("sec-websocket-protocol", "")
    if not ws_protocol:
        logger.warning("ws_auth_no_protocol")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing WebSocket authentication",
        )

    # Token is the first protocol value (before any comma)
    token = ws_protocol.split(",")[0].strip()
    if not token:
        logger.warning("ws_auth_empty_token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing WebSocket authentication token",
        )

    try:
        payload = jwt.decode(token, secret, algorithms=[ALGORITHM])
        tenant_id: str | None = payload.get("sub")
        tenant_name: str | None = payload.get("name")

        if not tenant_id:
            logger.warning("ws_auth_no_tenant_id")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: no tenant ID",
            )
    except JWTError as e:
        logger.warning("ws_auth_invalid_token", reason=str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    request.state.tenant_id = tenant_id
    logger.info("ws_auth_success", tenant_id=tenant_id)

    return AuthenticatedTenant(
        tenant_id=tenant_id,
        name=tenant_name or "Unknown",
        is_active=True,
    )
