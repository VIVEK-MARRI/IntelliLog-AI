from datetime import timedelta
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status, Header, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
import logging

logger = logging.getLogger(__name__)

from src.backend.app.db.base import get_db
from src.backend.app.db.models import User, Tenant
from src.backend.app.schemas import all as schemas
from src.backend.app.core.jwt import verify_password, get_password_hash, create_access_token, create_refresh_token, decode_token
from src.backend.app.core.config import settings
from src.backend.app.core.rate_limit import rate_limit_check, get_client_ip, RATE_LIMIT_POLICIES

router = APIRouter()


def get_current_user(
    authorization: str = Header(...),
    db: Session = Depends(get_db)
) -> User:
    """Extract and validate JWT token from Authorization header."""
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid authentication scheme"
            )
        
        payload = decode_token(token)
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials"
            )
        
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )
        
        return user
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token format"
        )


@router.post("/login", response_model=dict)
def login(
    request: Request,
    db: Session = Depends(get_db), 
    form_data: OAuth2PasswordRequestForm = Depends()
) -> Any:
    """
    OAuth2 compatible token login with JWT.
    Returns access token and refresh token.
    Rate limited to prevent brute force attacks.
    """
    client_ip = get_client_ip(request)
    policy = RATE_LIMIT_POLICIES["login"]
    rate_limit_check(request, f"login:{client_ip}", **policy)
    
    try:
        # Find user by email
        user = db.query(User).filter(User.email == form_data.username).first()
        
        if not user or not verify_password(form_data.password, user.hashed_password):
            logger.warning(f"Failed login attempt for {form_data.username} from {client_ip}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        if not user.is_active:
            logger.warning(f"Login attempt for inactive user {form_data.username}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Inactive user"
            )
        
        # Create tokens
        access_token = create_access_token(
            data={
                "sub": user.id,
                "email": user.email,
                "tenant_id": user.tenant_id,
                "role": user.role
            }
        )
        
        refresh_token = create_refresh_token(
            data={
                "sub": user.id,
                "email": user.email
            }
        )
        
        logger.info(f"Successful login for user {user.email} from {client_ip}")
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name,
                "role": user.role,
                "tenant_id": user.tenant_id
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        raise HTTPException(status_code=500, detail="Login failed")


@router.post("/signup", response_model=dict)
def create_user_signup(
    request: Request,
    user_in: schemas.UserCreate,
    db: Session = Depends(get_db),
) -> Any:
    """
    Create new user without the need to be logged in.
    Rate limited to prevent abuse.
    """
    client_ip = get_client_ip(request)
    policy = RATE_LIMIT_POLICIES["signup"]
    rate_limit_check(request, f"signup:{client_ip}", **policy)
    
    try:
        # Check if user already exists
        user = db.query(User).filter(User.email == user_in.email).first()
        if user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The user with this email already exists in the system",
            )
        
        # Check if tenant exists
        tenant = db.query(Tenant).filter(Tenant.id == user_in.tenant_id).first()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        # Create new user
        user = User(
            email=user_in.email,
            hashed_password=get_password_hash(user_in.password),
            full_name=user_in.full_name,
            role=user_in.role,
            tenant_id=user_in.tenant_id
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        
        logger.info(f"New user created: {user.email}")
        
        return {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "tenant_id": user.tenant_id,
            "is_active": user.is_active,
            "message": "User created successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Signup error: {str(e)}")
        raise HTTPException(status_code=500, detail="Signup failed")


@router.post("/refresh", response_model=dict)
def refresh_access_token(
    refresh_token: str = None,
    db: Session = Depends(get_db)
) -> Any:
    """
    Refresh access token using refresh token.
    """
    try:
        if not refresh_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token required"
            )
        
        payload = decode_token(refresh_token)
        if not payload or payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired refresh token"
            )
        
        user_id = payload.get("sub")
        user = db.query(User).filter(User.id == user_id).first()
        
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive"
            )
        
        # Create new access token
        access_token = create_access_token(
            data={
                "sub": user.id,
                "email": user.email,
                "tenant_id": user.tenant_id,
                "role": user.role
            }
        )
        
        logger.info(f"Token refreshed for user {user.email}")
        
        return {
            "access_token": access_token,
            "token_type": "bearer"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token refresh error: {str(e)}")
        raise HTTPException(status_code=500, detail="Token refresh failed")


@router.get("/me", response_model=dict)
def get_current_user_profile(current_user: User = Depends(get_current_user)) -> Any:
    """
    Get current user profile from JWT token.
    """
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "tenant_id": current_user.tenant_id,
        "is_active": current_user.is_active,
        "is_superuser": current_user.is_superuser,
        "created_at": current_user.created_at if hasattr(current_user, 'created_at') else None
    }


@router.post("/logout", response_model=dict)
def logout(current_user: User = Depends(get_current_user)) -> Any:
    """
    Logout endpoint - invalidates token on client side.
    (Token invalidation on server side would require token blacklist)
    """
    logger.info(f"User logged out: {current_user.email}")
    return {
        "message": "Successfully logged out",
        "success": True
    }
