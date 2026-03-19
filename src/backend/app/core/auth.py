"""Authentication and authorization utilities for API and service callers."""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable, Iterable, Optional

import bcrypt
from fastapi import Depends, Header, HTTPException, Request, status
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from src.backend.app.core.config import settings
from src.backend.app.core.rate_limit import enforce_rate_limit
from src.backend.app.db.base import get_db
from src.backend.app.db.models import APIKey, User

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24
REFRESH_TOKEN_EXPIRE_DAYS = 7

class TokenRequest(BaseModel):
    """Email/password login payload."""

    email: EmailStr
    password: str


class RefreshTokenRequest(BaseModel):
    """Refresh-token exchange payload."""

    refresh_token: str


class TokenResponse(BaseModel):
    """JWT response payload."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshResponse(BaseModel):
    """Refresh response payload."""

    access_token: str
    token_type: str = "bearer"


class APIKeyCreateRequest(BaseModel):
    """API key creation payload."""

    name: str


class APIKeyCreateResponse(BaseModel):
    """API key creation response."""

    id: str
    tenant_id: str
    name: str
    key_prefix: str
    api_key: str
    created_at: str


@dataclass
class AuthenticatedPrincipal:
    """Unified authenticated principal for JWT and API key auth."""

    user_id: str
    tenant_id: str
    role: str
    email: Optional[str]
    auth_type: str


# Compatibility alias used by API endpoints.
AuthenticatedUser = AuthenticatedPrincipal


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except ValueError:
        return False


def get_password_hash(password: str) -> str:
    """Hash password with bcrypt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def create_access_token(*, user_id: str, tenant_id: str, role: str, expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT access token."""
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))
    payload = {
        "sub": user_id,
        "tenant_id": tenant_id,
        "role": role,
        "type": "access",
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(*, user_id: str, tenant_id: str, role: str, expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT refresh token."""
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS))
    payload = {
        "sub": user_id,
        "tenant_id": tenant_id,
        "role": role,
        "type": "refresh",
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_jwt_token(token: str) -> dict:
    """Decode and validate JWT token payload."""
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc


def _authenticate_bearer_token(token: str, db: Session) -> AuthenticatedPrincipal:
    """Authenticate a bearer access token and resolve user identity."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as exc:
        detail = "Invalid token"
        if "Signature has expired" in str(exc):
            detail = "Token has expired"
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail) from exc

    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    user_id = payload.get("sub")
    tenant_id = payload.get("tenant_id")
    role = payload.get("role")
    if not user_id or not tenant_id or not role:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    user = db.query(User).filter(User.id == str(user_id), User.tenant_id == str(tenant_id)).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    return AuthenticatedPrincipal(
        user_id=str(user.id),
        tenant_id=str(user.tenant_id),
        role=str(user.role).lower(),
        email=user.email,
        auth_type="bearer",
    )


def _authenticate_api_key(raw_key: str, db: Session) -> AuthenticatedPrincipal:
    """Authenticate ApiKey header value against tenant-scoped bcrypt hashes."""
    if not raw_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing API key")

    key_prefix = raw_key[:12]
    candidates = (
        db.query(APIKey)
        .filter(APIKey.key_prefix == key_prefix, APIKey.is_active.is_(True))
        .all()
    )

    matched = None
    for candidate in candidates:
        if verify_password(raw_key, candidate.key_hash):
            matched = candidate
            break

    if matched is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")

    matched.last_used_at = datetime.utcnow()
    db.add(matched)
    db.commit()

    return AuthenticatedPrincipal(
        user_id=f"apikey:{matched.id}",
        tenant_id=str(matched.tenant_id),
        role="manager",
        email=None,
        auth_type="apikey",
    )


def generate_api_key() -> str:
    """Generate a high-entropy API key string."""
    return f"ik_{secrets.token_urlsafe(36)}"


def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> AuthenticatedPrincipal:
    """Resolve current principal from Authorization header and enforce rate limits."""
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Authorization header")

    if authorization.startswith("Bearer "):
        principal = _authenticate_bearer_token(authorization.split(" ", 1)[1], db)
    elif authorization.startswith("ApiKey "):
        principal = _authenticate_api_key(authorization.split(" ", 1)[1], db)
    else:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unsupported authentication scheme")

    request.state.current_user = principal
    enforce_rate_limit(request=request, principal=principal)
    return principal


def require_role(roles: Iterable[str]) -> Callable[[AuthenticatedPrincipal], AuthenticatedPrincipal]:
    """Return a dependency that validates the current principal role."""
    normalized = {role.lower() for role in roles}

    def _dependency(current_user: AuthenticatedPrincipal = Depends(get_current_user)) -> AuthenticatedPrincipal:
        if current_user.role.lower() not in normalized:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return current_user

    return _dependency
