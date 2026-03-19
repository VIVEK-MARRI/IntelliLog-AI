"""Authentication endpoints."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from src.backend.app.core.auth import (
    APIKeyCreateRequest,
    APIKeyCreateResponse,
    AuthenticatedPrincipal,
    RefreshResponse,
    RefreshTokenRequest,
    TokenRequest,
    TokenResponse,
    create_access_token,
    create_refresh_token,
    decode_jwt_token,
    generate_api_key,
    get_current_user,
    get_password_hash,
    require_role,
    verify_password,
)
from src.backend.app.db.base import get_db
from src.backend.app.db.models import APIKey, User

router = APIRouter()


@router.post("/token", response_model=TokenResponse)
def issue_token(payload: TokenRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Authenticate user and issue access + refresh tokens."""
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user")

    access_token = create_access_token(user_id=str(user.id), tenant_id=str(user.tenant_id), role=str(user.role))
    refresh_token = create_refresh_token(user_id=str(user.id), tenant_id=str(user.tenant_id), role=str(user.role))
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=RefreshResponse)
def refresh_access_token(payload: RefreshTokenRequest, db: Session = Depends(get_db)) -> RefreshResponse:
    """Issue a new access token from a valid refresh token."""
    decoded = decode_jwt_token(payload.refresh_token)
    if decoded.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user_id = str(decoded.get("sub", ""))
    tenant_id = str(decoded.get("tenant_id", ""))
    role = str(decoded.get("role", ""))
    if not user_id or not tenant_id or not role:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token payload")

    user = db.query(User).filter(User.id == user_id, User.tenant_id == tenant_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    access_token = create_access_token(user_id=user_id, tenant_id=tenant_id, role=role)
    return RefreshResponse(access_token=access_token)


@router.post(
    "/api-keys",
    response_model=APIKeyCreateResponse,
    dependencies=[Depends(require_role(["admin", "manager"]))],
)
def create_api_key(
    payload: APIKeyCreateRequest,
    current_user: AuthenticatedPrincipal = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> APIKeyCreateResponse:
    """Create and store a tenant-scoped machine API key (bcrypt-hashed)."""
    plaintext_key = generate_api_key()
    key_row = APIKey(
        tenant_id=current_user.tenant_id,
        created_by_user_id=current_user.user_id if not current_user.user_id.startswith("apikey:") else None,
        name=payload.name.strip(),
        key_prefix=plaintext_key[:12],
        key_hash=get_password_hash(plaintext_key),
        is_active=True,
        created_at=datetime.utcnow(),
    )

    db.add(key_row)
    db.commit()
    db.refresh(key_row)

    return APIKeyCreateResponse(
        id=str(key_row.id),
        tenant_id=str(key_row.tenant_id),
        name=key_row.name,
        key_prefix=key_row.key_prefix,
        api_key=plaintext_key,
        created_at=key_row.created_at.isoformat(),
    )


@router.get("/me")
def get_me(current_user: AuthenticatedPrincipal = Depends(get_current_user)):
    """Return authenticated principal context."""
    return {
        "user_id": current_user.user_id,
        "tenant_id": current_user.tenant_id,
        "role": current_user.role,
        "email": current_user.email,
        "auth_type": current_user.auth_type,
    }
