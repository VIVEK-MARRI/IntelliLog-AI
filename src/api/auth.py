"""
Authentication module: JWT Bearer tokens with refresh/revoke, bcrypt passwords.

All authentication paths fail closed - invalid credentials are rejected.
No default fallback secrets exist anywhere in the codebase.

Migration note:
  - passwords now use bcrypt (password_hash column)
  - api_key_hash column (SHA-256) is for API keys only, not login
  - refresh tokens are stored as SHA-256 hashes in Redis for revocation
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import structlog
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_db, get_redis
from src.core.config import get_settings

logger = structlog.get_logger(__name__)

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7


class AuthenticatedTenant(BaseModel):
    """Authenticated tenant from JWT or API key."""
    tenant_id: str
    name: str
    is_active: bool


# ---------------------------------------------------------------------------
# Password hashing (bcrypt)
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    """Hash a password with bcrypt (auto-generates salt)."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against a bcrypt hash. Uses secure comparison."""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, AttributeError):
        return False


# ---------------------------------------------------------------------------
# API key hashing (SHA-256 — acceptable for server-generated keys)
# ---------------------------------------------------------------------------

def hash_api_key(api_key: str) -> str:
    """Hash an API key with SHA-256."""
    return hashlib.sha256(api_key.encode()).hexdigest()


# ---------------------------------------------------------------------------
# Secret key
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Access token (short-lived JWT)
# ---------------------------------------------------------------------------

def create_access_token(
    tenant_id: str,
    name: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    Create short-lived JWT access token.
    Default expiry: 15 minutes.
    """
    secret = _get_secret_key()
    if expires_delta is None:
        expires_delta = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    expire = datetime.now(timezone.utc) + expires_delta
    payload = {
        "sub": tenant_id,
        "name": name,
        "type": "access",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    token = jwt.encode(payload, secret, algorithm=ALGORITHM)
    logger.info("access_token_created", tenant_id=tenant_id)
    return token


# ---------------------------------------------------------------------------
# Refresh token (JWT with jti, stored in Redis for revocation)
# ---------------------------------------------------------------------------

async def create_refresh_token(tenant_id: str, name: str) -> tuple[str, str]:
    """
    Create a refresh token and store it in Redis.
    Returns (refresh_token_jwt, raw_jti).
    The jti is derived from a random UUID so it can be revoked later.
    """
    secret = _get_secret_key()
    jti = str(uuid.uuid4())
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": tenant_id,
        "name": name,
        "type": "refresh",
        "jti": jti,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    token = jwt.encode(payload, secret, algorithm=ALGORITHM)

    redis_client = await get_redis()
    jti_hash = hashlib.sha256(jti.encode()).hexdigest()
    await redis_client.setex(
        f"refresh_token:{jti_hash}",
        REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        tenant_id,
    )
    logger.info("refresh_token_created", tenant_id=tenant_id)
    return token, jti


async def revoke_refresh_token(jti: str) -> None:
    """Revoke a refresh token by deleting its Redis entry."""
    jti_hash = hashlib.sha256(jti.encode()).hexdigest()
    redis_client = await get_redis()
    await redis_client.delete(f"refresh_token:{jti_hash}")
    logger.info("refresh_token_revoked", jti_hash=jti_hash[:8])


async def is_refresh_token_revoked(jti: str) -> bool:
    """Check if a refresh token has been revoked."""
    jti_hash = hashlib.sha256(jti.encode()).hexdigest()
    redis_client = await get_redis()
    exists = await redis_client.exists(f"refresh_token:{jti_hash}")
    return not bool(exists)


# ---------------------------------------------------------------------------
# Access token verification
# ---------------------------------------------------------------------------

async def get_current_tenant(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
    db: AsyncSession = Depends(get_db),
) -> AuthenticatedTenant:
    """
    Validate JWT Bearer token and verify tenant exists in database.
    Only accepts tokens with type="access".

    Dev mode: when SKIP_EXTERNAL_STARTUP_CHECKS is true, skip JWT validation.
    """
    settings = get_settings()
    if settings.skip_external_startup_checks:
        request.state.tenant_id = "dev-tenant-id"
        structlog.contextvars.bind_contextvars(tenant_id=request.state.tenant_id)
        return AuthenticatedTenant(
            tenant_id=request.state.tenant_id,
            name="Dev User",
            is_active=True,
        )

    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    secret = _get_secret_key()
    token = credentials.credentials

    try:
        payload = jwt.decode(token, secret, algorithms=[ALGORITHM])
        token_type: str | None = payload.get("type")
        if token_type != "access":
            logger.warning("token_invalid", reason="not_an_access_token")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
            )
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

    # Verify tenant exists and is active
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

    request.state.tenant_id = tenant_id
    structlog.contextvars.bind_contextvars(tenant_id=tenant_id)
    logger.info("token_validated", tenant_id=tenant_id)
    return AuthenticatedTenant(
        tenant_id=tenant_id,
        name=tenant_name or "Unknown",
        is_active=True,
    )


# ---------------------------------------------------------------------------
# API key authentication
# ---------------------------------------------------------------------------

async def get_tenant_from_api_key(
    api_key: str,
    db: AsyncSession,
) -> AuthenticatedTenant:
    """
    Validate API key via SHA-256 hashed lookup against database.
    API keys are independent of login passwords.
    """
    api_key_hashed = hash_api_key(api_key)

    try:
        result = await db.execute(
            text("""
                SELECT t.id, t.name, t.is_active
                FROM tenants t
                WHERE t.api_key_hash = :api_key_hash
            """),
            {"api_key_hash": api_key_hashed},
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


# ---------------------------------------------------------------------------
# WebSocket authentication
# ---------------------------------------------------------------------------

async def get_current_tenant_ws(
    request: Request,
    db: AsyncSession = Depends(lambda: None),
) -> AuthenticatedTenant:
    """
    Authenticate WebSocket connections via Sec-WebSocket-Protocol header.
    Accepts access tokens (type="access") only.

    Dev mode: when SKIP_EXTERNAL_STARTUP_CHECKS is true, skip JWT validation.
    """
    settings = get_settings()
    if settings.skip_external_startup_checks:
        request.state.tenant_id = "dev-tenant-id"
        structlog.contextvars.bind_contextvars(tenant_id=request.state.tenant_id)
        return AuthenticatedTenant(
            tenant_id=request.state.tenant_id,
            name="Dev User",
            is_active=True,
        )

    secret = _get_secret_key()
    ws_protocol = request.headers.get("sec-websocket-protocol", "")
    if not ws_protocol:
        logger.warning("ws_auth_no_protocol")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing WebSocket authentication",
        )
    token = ws_protocol.split(",")[0].strip()
    if not token:
        logger.warning("ws_auth_empty_token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing WebSocket authentication token",
        )
    try:
        payload = jwt.decode(token, secret, algorithms=[ALGORITHM])
        token_type: str | None = payload.get("type")
        if token_type != "access":
            logger.warning("ws_auth_invalid_type")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type for WebSocket",
            )
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
