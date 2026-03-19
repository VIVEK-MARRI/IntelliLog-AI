"""Integration tests for authentication, tenant isolation, and rate limiting."""

from __future__ import annotations

from datetime import timedelta
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.backend.app.api.api_v1.api import api_router
from src.backend.app.api import deps
from src.backend.app.core.auth import create_access_token, get_password_hash
from src.backend.app.core.rate_limit import RateLimitExceededError
from src.backend.app.db.base import Base, get_db
from src.backend.app.db.models import Order, Tenant, User


@pytest.fixture
def client_and_session():
    """Build an isolated in-memory app and database session for each test."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, expire_on_commit=False)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app = FastAPI()
    app.include_router(api_router, prefix="/api/v1")

    @app.exception_handler(RateLimitExceededError)
    async def _rate_limit_handler(request, exc: RateLimitExceededError):
        from fastapi.responses import JSONResponse

        return JSONResponse(
            status_code=429,
            content={
                "error": "rate_limit_exceeded",
                "retry_after_seconds": int(exc.retry_after_seconds),
                "limit": exc.limit,
            },
        )

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[deps.get_db_session] = override_get_db

    client = TestClient(app)
    yield client, TestingSessionLocal


def _seed_tenant_and_user(session_factory, tenant_name: str, role: str = "manager"):
    db = session_factory()
    try:
        tenant = Tenant(
            id=str(uuid.uuid4()),
            name=tenant_name,
            slug=f"{tenant_name.lower()}-{uuid.uuid4().hex[:8]}",
            plan="free",
        )
        user = User(
            id=str(uuid.uuid4()),
            email=f"{tenant_name.lower()}@example.com",
            hashed_password=get_password_hash("StrongPass123!"),
            full_name=f"{tenant_name} User",
            is_active=True,
            is_superuser=False,
            role=role,
            tenant_id=tenant.id,
        )
        db.add(tenant)
        db.add(user)
        db.commit()
        db.refresh(user)
        return {
            "tenant_id": tenant.id,
            "user_id": user.id,
            "email": user.email,
            "role": user.role,
        }
    finally:
        db.close()


def _auth_header_for(user_info):
    token = create_access_token(
        user_id=user_info["user_id"],
        tenant_id=user_info["tenant_id"],
        role=user_info["role"],
    )
    return {"Authorization": f"Bearer {token}"}


def test_unauthenticated_request_returns_401(client_and_session):
    client, _ = client_and_session
    response = client.get("/api/v1/orders/")
    assert response.status_code == 401


def test_wrong_tenant_data_returns_404(client_and_session):
    client, session_factory = client_and_session

    user_a = _seed_tenant_and_user(session_factory, "TenantA", role="manager")
    user_b = _seed_tenant_and_user(session_factory, "TenantB", role="manager")

    db = session_factory()
    try:
        order = Order(
            id=str(uuid.uuid4()),
            order_number=f"ORD-{uuid.uuid4().hex[:8]}",
            customer_name="Test Customer",
            delivery_address="123 Main St",
            lat=10.0,
            lng=20.0,
            weight=1.0,
            status="pending",
            tenant_id=user_b["tenant_id"],
        )
        db.add(order)
        db.commit()
        db.refresh(order)
        order_id = order.id
    finally:
        db.close()

    response = client.get(f"/api/v1/orders/{order_id}", headers=_auth_header_for(user_a))
    assert response.status_code == 404


def test_rate_limit_triggers_at_61st_request(client_and_session):
    client, session_factory = client_and_session
    user = _seed_tenant_and_user(session_factory, "TenantRate", role="manager")
    headers = _auth_header_for(user)

    last_response = None
    for _ in range(61):
        last_response = client.get("/api/v1/status/status/system", headers=headers)

    assert last_response is not None
    assert last_response.status_code == 429
    payload = last_response.json()
    assert payload["error"] == "rate_limit_exceeded"
    assert payload["retry_after_seconds"] >= 1
    assert payload["limit"] == "60/minute"


def test_expired_token_returns_401_with_clear_message(client_and_session):
    client, session_factory = client_and_session
    user = _seed_tenant_and_user(session_factory, "TenantExpired", role="manager")

    expired_token = create_access_token(
        user_id=user["user_id"],
        tenant_id=user["tenant_id"],
        role=user["role"],
        expires_delta=timedelta(seconds=-1),
    )
    response = client.get("/api/v1/orders/", headers={"Authorization": f"Bearer {expired_token}"})

    assert response.status_code == 401
    assert response.json().get("detail") == "Token has expired"
