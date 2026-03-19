"""Tests for non-blocking Celery A/B testing workflow."""

from __future__ import annotations

import time
from datetime import datetime, timedelta
from typing import Any, Dict, List

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.backend.app.db.base import Base
from src.backend.app.db.models import ABTest, DeliveryFeedback, Tenant
from src.backend.worker import tasks


class _FakeRedis:
    """Minimal in-memory Redis stub for task-unit testing."""

    def __init__(self) -> None:
        self._store: Dict[str, str] = {}

    def set(self, key: str, value: str, ex: int | None = None) -> None:
        self._store[key] = value

    def get(self, key: str) -> str | None:
        return self._store.get(key)

    def delete(self, key: str) -> None:
        self._store.pop(key, None)


def _build_test_session_factory() -> sessionmaker:
    """Create in-memory sqlite session factory for tests."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autocommit=False, autoflush=False)


def _seed_tenant(session_factory: sessionmaker, tenant_id: str) -> None:
    """Insert a tenant row required by foreign-key constraints."""
    session = session_factory()
    try:
        session.add(Tenant(id=tenant_id, name="Tenant", slug=f"tenant-{tenant_id}"))
        session.commit()
    finally:
        session.close()


def _insert_feedback(
    session_factory: sessionmaker,
    tenant_id: str,
    model_version: str,
    errors: List[float],
    start_time: datetime,
) -> None:
    """Insert delivery_feedback rows where |predicted-actual| equals provided errors."""
    session = session_factory()
    try:
        for idx, error in enumerate(errors):
            session.add(
                DeliveryFeedback(
                    tenant_id=tenant_id,
                    order_id=f"order-{model_version}-{idx}",
                    prediction_model_version=model_version,
                    predicted_eta_min=float(error),
                    actual_delivery_min=0.0,
                    predicted_at=start_time + timedelta(minutes=idx),
                )
            )
        session.commit()
    finally:
        session.close()


def test_start_ab_test_returns_quickly(monkeypatch: Any) -> None:
    """Ensure start_ab_test does not block and schedules result collection asynchronously."""
    session_factory = _build_test_session_factory()
    tenant_id = "tenant-quick"
    _seed_tenant(session_factory, tenant_id)

    fake_redis = _FakeRedis()
    scheduled: Dict[str, Any] = {}

    monkeypatch.setattr(tasks, "SessionLocal", session_factory)
    monkeypatch.setattr(tasks, "_get_current_production_version", lambda: "v_baseline")
    monkeypatch.setattr(tasks, "_get_redis_client", lambda: fake_redis)

    def _capture_apply_async(*args: Any, **kwargs: Any) -> None:
        scheduled["args"] = args
        scheduled["kwargs"] = kwargs

    monkeypatch.setattr(tasks.collect_ab_results, "apply_async", _capture_apply_async)

    start = time.perf_counter()
    result = tasks.start_ab_test.run(tenant_id, "v_candidate", duration_hours=48)
    elapsed = time.perf_counter() - start

    assert elapsed < 1.0
    assert result["status"] == "running"
    assert result["model_a_version"] == "v_baseline"
    assert result["model_b_version"] == "v_candidate"
    assert "kwargs" in scheduled


def test_collect_ab_results_promotes_candidate_when_significant(monkeypatch: Any) -> None:
    """Verify candidate promotion when p-value gate and MAE improvement both pass."""
    session_factory = _build_test_session_factory()
    tenant_id = "tenant-promote"
    _seed_tenant(session_factory, tenant_id)

    fake_redis = _FakeRedis()
    promoted: Dict[str, str] = {}
    archived: Dict[str, str] = {}

    monkeypatch.setattr(tasks, "SessionLocal", session_factory)
    monkeypatch.setattr(tasks, "_get_redis_client", lambda: fake_redis)
    monkeypatch.setattr(tasks, "promote_model_to_production", lambda version: promoted.update({"version": version}))
    monkeypatch.setattr(tasks, "archive_candidate_model", lambda version, reason: archived.update({"version": version, "reason": reason}))

    session = session_factory()
    try:
        started_at = datetime.utcnow() - timedelta(hours=1)
        ends_at = datetime.utcnow() + timedelta(hours=1)
        test = ABTest(
            tenant_id=tenant_id,
            model_a_version="v_baseline",
            model_b_version="v_candidate",
            started_at=started_at,
            ends_at=ends_at,
            status="running",
            winner=None,
        )
        session.add(test)
        session.commit()
        session.refresh(test)
        test_id = test.id
    finally:
        session.close()

    _insert_feedback(
        session_factory,
        tenant_id,
        "v_baseline",
        [10.0, 11.0, 9.5, 10.5, 11.2, 9.8, 10.7, 10.9],
        started_at,
    )
    _insert_feedback(
        session_factory,
        tenant_id,
        "v_candidate",
        [2.0, 2.5, 1.8, 2.2, 2.4, 1.9, 2.1, 2.3],
        started_at,
    )

    result = tasks.collect_ab_results.run(test_id)

    assert result["status"] == "complete"
    assert result["winner"] == "v_candidate"
    assert result["p_value"] < 0.05
    assert result["candidate_mae"] < result["baseline_mae"]
    assert promoted["version"] == "v_candidate"
    assert "version" not in archived


def test_collect_ab_results_non_significant_does_not_promote(monkeypatch: Any) -> None:
    """Verify non-significant tests fail the promotion gate even with slightly lower MAE."""
    session_factory = _build_test_session_factory()
    tenant_id = "tenant-nosig"
    _seed_tenant(session_factory, tenant_id)

    fake_redis = _FakeRedis()
    promoted: Dict[str, str] = {}
    archived: Dict[str, str] = {}

    monkeypatch.setattr(tasks, "SessionLocal", session_factory)
    monkeypatch.setattr(tasks, "_get_redis_client", lambda: fake_redis)
    monkeypatch.setattr(tasks, "promote_model_to_production", lambda version: promoted.update({"version": version}))
    monkeypatch.setattr(tasks, "archive_candidate_model", lambda version, reason: archived.update({"version": version, "reason": reason}))

    session = session_factory()
    try:
        started_at = datetime.utcnow() - timedelta(hours=1)
        ends_at = datetime.utcnow() + timedelta(hours=1)
        test = ABTest(
            tenant_id=tenant_id,
            model_a_version="v_baseline",
            model_b_version="v_candidate",
            started_at=started_at,
            ends_at=ends_at,
            status="running",
            winner=None,
        )
        session.add(test)
        session.commit()
        session.refresh(test)
        test_id = test.id
    finally:
        session.close()

    _insert_feedback(
        session_factory,
        tenant_id,
        "v_baseline",
        [5.0, 15.0, 25.0, 35.0],
        started_at,
    )
    _insert_feedback(
        session_factory,
        tenant_id,
        "v_candidate",
        [4.0, 14.0, 24.0, 34.0],
        started_at,
    )

    result = tasks.collect_ab_results.run(test_id)

    assert result["status"] == "complete"
    assert result["candidate_mae"] < result["baseline_mae"]
    assert result["p_value"] >= 0.05
    assert "version" not in promoted
    assert archived["version"] == "v_candidate"
