"""Authentication endpoints."""

from __future__ import annotations

from datetime import datetime
import re

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
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
from src.backend.app.db.models import APIKey, Tenant, User

router = APIRouter()


class SignupRequest(BaseModel):
    email: EmailStr
    full_name: str | None = None
    password: str
    tenant_id: str | None = None
    role: str = "user"


class SignupResponse(BaseModel):
    id: str
    email: EmailStr
    full_name: str | None = None
    role: str
    tenant_id: str
    is_active: bool


def _normalize_slug(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return slug or "default"


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


@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, db: Session = Depends(get_db)) -> SignupResponse:
    """Register a new user account for a tenant.

    If tenant_id is not provided or not found, a safe default tenant is used/created.
    """
    existing_user = db.query(User).filter(User.email == payload.email).first()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is already registered")

    tenant: Tenant | None = None
    requested_tenant_id = (payload.tenant_id or "").strip()
    if requested_tenant_id:
        tenant = db.query(Tenant).filter(Tenant.id == requested_tenant_id).first()

    if not tenant:
        tenant = db.query(Tenant).filter(Tenant.slug == "default").first()

    if not tenant:
        tenant = Tenant(name="Default Tenant", slug="default", plan="free")
        db.add(tenant)
        db.flush()

    role = (payload.role or "user").strip().lower()
    if role not in {"user", "dispatcher", "manager", "admin"}:
        role = "user"

    new_user = User(
        email=payload.email,
        full_name=(payload.full_name or "").strip() or None,
        hashed_password=get_password_hash(payload.password),
        is_active=True,
        is_superuser=(role == "admin"),
        role=role,
        tenant_id=str(tenant.id),
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return SignupResponse(
        id=str(new_user.id),
        email=new_user.email,
        full_name=new_user.full_name,
        role=str(new_user.role),
        tenant_id=str(new_user.tenant_id),
        is_active=bool(new_user.is_active),
    )


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
