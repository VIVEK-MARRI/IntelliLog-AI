"""Tests for delivery-completion to continuous-learning feedback wiring."""

from __future__ import annotations

import uuid
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.backend.app.api.api_v1.api import api_router
from src.backend.app.api import deps
from src.backend.app.core.auth import AuthenticatedUser, get_current_user
from src.backend.app.db.base import Base, get_db
from src.backend.app.db.models import DeliveryFeedback, Order


def _build_client_and_session():
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

    def override_current_user():
        return AuthenticatedUser(
            user_id=str(uuid.uuid4()),
            tenant_id="tenant-1",
            role="manager",
            email="manager@example.com",
            auth_type="bearer",
        )

    app = FastAPI()
    app.include_router(api_router, prefix="/api/v1")

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[deps.get_db_session] = override_get_db
    app.dependency_overrides[get_current_user] = override_current_user
    app.dependency_overrides[deps.get_current_user] = override_current_user

    client = TestClient(app)
    return client, TestingSessionLocal


def _seed_order_and_prediction(session_factory):
    db = session_factory()
    try:
        order = Order(
            id=str(uuid.uuid4()),
            order_number=f"ORD-{uuid.uuid4().hex[:8]}",
            customer_name="Test Customer",
            delivery_address="123 Main St",
            lat=12.9716,
            lng=77.5946,
            weight=1.0,
            status="assigned",
            tenant_id="tenant-1",
        )
        feedback = DeliveryFeedback(
            id=str(uuid.uuid4()),
            order_id=order.id,
            tenant_id="tenant-1",
            prediction_model_version="v_test_001",
            predicted_eta_min=24.0,
            actual_delivery_min=None,
        )
        db.add(order)
        db.add(feedback)
        db.commit()
        return order.id
    finally:
        db.close()


def test_complete_order_triggers_feedback_task_with_error_min():
    client, session_factory = _build_client_and_session()
    order_id = _seed_order_and_prediction(session_factory)

    with patch("src.backend.app.api.api_v1.endpoints.orders._enqueue_delivery_feedback_task") as delay_mock:
        response = client.post(
            f"/api/v1/orders/{order_id}/complete",
            json={"actual_delivery_minutes": 28.0},
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 200
        delay_mock.assert_called_once()
        _, kwargs = delay_mock.call_args
        assert kwargs["order_id"] == order_id
        assert kwargs["tenant_id"] == "tenant-1"
        assert kwargs["predicted_eta_min"] == 24.0
        assert kwargs["actual_delivery_min"] == 28.0
        assert kwargs["error_min"] == 4.0


def test_complete_order_without_actual_minutes_does_not_trigger_feedback_task():
    client, session_factory = _build_client_and_session()
    order_id = _seed_order_and_prediction(session_factory)

    with patch("src.backend.app.api.api_v1.endpoints.orders._enqueue_delivery_feedback_task") as delay_mock:
        response = client.post(
            f"/api/v1/orders/{order_id}/complete",
            json={"actual_delivery_minutes": None},
            headers={"Authorization": "Bearer test-token"},
        )

        assert response.status_code == 200
        delay_mock.assert_not_called()


def test_no_dispatch_when_predicted_eta_is_none():
    """Feedback task should NOT fire when predicted_eta_min is None.
    
    This covers the case of manually-assigned orders that bypassed the ML
    prediction system entirely. The feedback loop should not process orders
    the ML system never saw.
    """
    client, session_factory = _build_client_and_session()
    
    # Seed an order with NO prediction (predicted_eta_min = None)
    db = session_factory()
    try:
        order = Order(
            id=str(uuid.uuid4()),
            order_number=f"ORD-{uuid.uuid4().hex[:8]}",
            customer_name="Manual Order",
            delivery_address="456 Oak St",
            lat=12.9716,
            lng=77.5946,
            weight=2.0,
            status="assigned",
            tenant_id="tenant-1",
        )
        # NO DeliveryFeedback record created (predicted_eta_min stays None)
        db.add(order)
        db.commit()
        order_id = order.id
    finally:
        db.close()
    
    with patch("src.backend.app.api.api_v1.endpoints.orders._enqueue_delivery_feedback_task") as delay_mock:
        response = client.post(
            f"/api/v1/orders/{order_id}/complete",
            json={"actual_delivery_minutes": 28.0},
            headers={"Authorization": "Bearer test-token"},
        )
        
        assert response.status_code == 200
        delay_mock.assert_not_called()


def test_dispatch_fires_with_both_values_present():
    """Regression guard: feedback task should fire when both values present.
    
    This ensures the None guards did not accidentally block valid dispatches.
    Tests the happy path with predicted_eta=24.0 and actual=28.0.
    """
    client, session_factory = _build_client_and_session()
    order_id = _seed_order_and_prediction(session_factory)
    
    with patch("src.backend.app.api.api_v1.endpoints.orders._enqueue_delivery_feedback_task") as delay_mock:
        response = client.post(
            f"/api/v1/orders/{order_id}/complete",
            json={"actual_delivery_minutes": 28.0},
            headers={"Authorization": "Bearer test-token"},
        )
        
        assert response.status_code == 200
        delay_mock.assert_called_once()
        _, kwargs = delay_mock.call_args
        assert kwargs["predicted_eta_min"] == 24.0
        assert kwargs["actual_delivery_min"] == 28.0
        assert kwargs["error_min"] == 4.0


def test_dispatch_fires_with_zero_eta():
    """Edge case: predicted_eta_min can be 0.0 (same-building delivery).
    
    The guard must use `is not None`, not truthiness check.
    If it used truthiness (if predicted_eta_minutes and ...), then 0.0
    would be falsy and the task would not dispatch.
    """
    client, session_factory = _build_client_and_session()
    
    # Seed an order with predicted_eta_min = 0.0
    db = session_factory()
    try:
        order = Order(
            id=str(uuid.uuid4()),
            order_number=f"ORD-{uuid.uuid4().hex[:8]}",
            customer_name="Same Building",
            delivery_address="789 Main St Apt 5",
            lat=12.9716,
            lng=77.5946,
            weight=0.5,
            status="assigned",
            tenant_id="tenant-1",
        )
        feedback = DeliveryFeedback(
            id=str(uuid.uuid4()),
            order_id=order.id,
            tenant_id="tenant-1",
            prediction_model_version="v_test_001",
            predicted_eta_min=0.0,  # Same-building delivery
            actual_delivery_min=None,
        )
        db.add(order)
        db.add(feedback)
        db.commit()
        order_id = order.id
    finally:
        db.close()
    
    with patch("src.backend.app.api.api_v1.endpoints.orders._enqueue_delivery_feedback_task") as delay_mock:
        response = client.post(
            f"/api/v1/orders/{order_id}/complete",
            json={"actual_delivery_minutes": 2.0},
            headers={"Authorization": "Bearer test-token"},
        )
        
        assert response.status_code == 200
        delay_mock.assert_called_once()
        _, kwargs = delay_mock.call_args
        assert kwargs["predicted_eta_min"] == 0.0
        assert kwargs["actual_delivery_min"] == 2.0
        assert kwargs["error_min"] == 2.0
