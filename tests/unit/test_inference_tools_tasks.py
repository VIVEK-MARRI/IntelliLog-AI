from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import httpx
import numpy as np
import pytest

from celery.exceptions import SoftTimeLimitExceeded

from src.agent.tools import (
    send_customer_notification,
    update_order_eta,
    write_audit_log,
)
from src.ml.feature_engineering import FeatureBuilder, FeatureStats
from src.ml.inference import PredictionService
from src.optimization.solver import RoutingProblem, RoutingResult
from src.optimization.tasks import solve_routing_job


class StubModel:
    def __init__(self, risk_score: float) -> None:
        self.risk_score = risk_score

    def predict_proba(self, x: np.ndarray) -> np.ndarray:
        return np.array([[1.0 - self.risk_score, self.risk_score]], dtype=float)


class StubExplainer:
    def __init__(self, shap_values: np.ndarray) -> None:
        self._shap_values = shap_values

    def shap_values(self, x: np.ndarray) -> np.ndarray:
        return self._shap_values


def build_prediction_service(risk_score: float = 0.9) -> PredictionService:
    builder = FeatureBuilder()
    feature_names = builder.get_feature_names()

    service = PredictionService.__new__(PredictionService)
    service.model = StubModel(risk_score)
    service.feature_names = feature_names
    service.optimal_threshold = 0.7
    service.feature_stats = FeatureStats(
        feature_medians={name: 0.5 for name in feature_names},
        feature_mins={name: 0.0 for name in feature_names},
        feature_maxs={name: 1.0 for name in feature_names},
    )
    service.feature_builder = builder
    service.model_version = "test-model"
    service._explainer = None
    return service


def make_valid_features(service: PredictionService) -> dict[str, float]:
    return {name: 0.5 for name in service.feature_names}


@pytest.mark.asyncio
async def test_send_customer_notification_success() -> None:
    redis_client = AsyncMock()
    redis_client.get = AsyncMock(side_effect=[None, b"https://example.test/webhook"])
    redis_client.setex = AsyncMock()

    http_client = AsyncMock()
    response = MagicMock()
    response.raise_for_status = MagicMock(return_value=None)
    http_client.post = AsyncMock(return_value=response)

    result = await send_customer_notification(
        order_id="order-123",
        tenant_id="tenant-123",
        delay_minutes=17.2,
        reason="Traffic",
        new_eta=datetime.now(timezone.utc),
        http_client=http_client,
        redis_client=redis_client,
    )

    assert result.success is True
    assert result.notification_id is not None
    http_client.post.assert_awaited_once()
    redis_client.setex.assert_awaited_once()


@pytest.mark.asyncio
async def test_send_customer_notification_no_webhook_configured() -> None:
    redis_client = AsyncMock()
    redis_client.get = AsyncMock(side_effect=[None, None])

    http_client = AsyncMock()

    result = await send_customer_notification(
        order_id="order-123",
        tenant_id="tenant-123",
        delay_minutes=10.0,
        reason="Delay",
        new_eta=datetime.now(timezone.utc),
        http_client=http_client,
        redis_client=redis_client,
    )

    assert result.success is False
    assert "webhook URL" in result.error_message
    http_client.post.assert_not_awaited()


@pytest.mark.asyncio
async def test_send_customer_notification_timeout() -> None:
    redis_client = AsyncMock()
    redis_client.get = AsyncMock(side_effect=[None, b"https://example.test/webhook"])

    http_client = AsyncMock()
    http_client.post = AsyncMock(side_effect=httpx.TimeoutException("timeout"))

    result = await send_customer_notification(
        order_id="order-123",
        tenant_id="tenant-123",
        delay_minutes=10.0,
        reason="Delay",
        new_eta=datetime.now(timezone.utc),
        http_client=http_client,
        redis_client=redis_client,
    )

    assert result.success is False
    assert "timed out" in result.error_message


@pytest.mark.asyncio
async def test_update_order_eta_publishes_events() -> None:
    db_session = AsyncMock()
    db_session.execute.return_value = SimpleNamespace(rowcount=1)
    db_session.commit = AsyncMock()

    redis_client = AsyncMock()
    redis_client.get = AsyncMock(return_value=b"tenant-777")
    redis_client.publish = AsyncMock()

    result = await update_order_eta(
        order_id="order-777",
        new_eta=datetime.now(timezone.utc),
        reason="Driver delay",
        db_session=db_session,
        redis_client=redis_client,
    )

    assert result is True
    db_session.commit.assert_awaited_once()
    assert redis_client.publish.await_count == 2


@pytest.mark.asyncio
async def test_write_audit_log_with_redis_publish() -> None:
    db_session = AsyncMock()
    redis_client = AsyncMock()
    redis_client.publish = AsyncMock()

    audit_id = await write_audit_log(
        order_id="order-900",
        tenant_id="tenant-900",
        driver_id="driver-900",
        decision="reroute_and_alert",
        risk_score=0.91,
        top_risk_factors=[{"feature": "speed", "contribution": 0.4}],
        tools_called=["call_route_optimizer", "send_customer_notification"],
        reroute_result={"success": True},
        notification_result={"success": True},
        db_session=db_session,
        redis_client=redis_client,
    )

    assert audit_id is not None
    assert audit_id.startswith("audit:order-900:")
    assert redis_client.publish.await_count == 2


def test_predict_high_risk_and_confidence() -> None:
    service = build_prediction_service(risk_score=0.92)
    result = service.predict("order-1", make_valid_features(service))

    assert result.is_high_risk is True
    # New proportional formula: (risk_score - threshold) / (1.0 - threshold) * 60
    # For score=0.92, threshold=0.7: (0.22 / 0.30) * 60 = 44.0
    assert result.predicted_delay_minutes == pytest.approx(44.0, abs=0.5)
    assert result.confidence == "high"
    assert result.top_risk_factors == []


def test_predict_rejects_missing_features() -> None:
    service = build_prediction_service(risk_score=0.2)

    with pytest.raises(ValueError, match="Invalid features"):
        service.predict("order-1", {"stops_remaining_ratio": 0.5})


def test_predict_with_shap_extracts_sorted_top_factors(monkeypatch: pytest.MonkeyPatch) -> None:
    service = build_prediction_service(risk_score=0.84)
    shap_row = np.zeros(len(service.feature_names), dtype=float)
    shap_row[1] = -0.7
    shap_row[4] = 0.4
    shap_row[0] = 0.2

    monkeypatch.setattr(
        "src.ml.inference.shap.TreeExplainer",
        lambda model: StubExplainer(np.array([shap_row], dtype=float)),
    )

    result = service.predict_with_shap("order-2", make_valid_features(service))

    assert len(result.top_risk_factors) == 5
    assert result.top_risk_factors[0]["feature"] == service.feature_names[1]
    assert result.top_risk_factors[0]["direction"] == "decreases_risk"
    assert result.top_risk_factors[1]["feature"] == service.feature_names[4]
    assert result.top_risk_factors[1]["direction"] == "increases_risk"


def test_benchmark_raises_when_latency_is_too_high() -> None:
    service = build_prediction_service(risk_score=0.1)

    def slow_predict(order_id: str, features: dict[str, float]) -> SimpleNamespace:
        return SimpleNamespace(inference_latency_ms=60.0)

    service.predict = slow_predict  # type: ignore[method-assign]

    with pytest.raises(ValueError, match="exceeds 50ms SLA"):
        service.benchmark(n_predictions=5)


def test_celery_task_success(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_redis = MagicMock()
    fake_redis.hset = MagicMock()
    fake_redis.publish = MagicMock()

    class FakeSolver:
        def solve(self, problem: RoutingProblem) -> RoutingResult:
            return RoutingResult(
                ordered_stops=[stop.stop_id for stop in problem.stops],
                total_distance_km=12.5,
                total_duration_minutes=30.0,
                time_saved_minutes=4.0,
                solver_status="feasible",
                solver_duration_ms=18,
            )

    monkeypatch.setattr("redis.Redis.from_url", lambda *args, **kwargs: fake_redis)
    monkeypatch.setattr("src.optimization.tasks.VRPSolver", lambda timeout_seconds=5: FakeSolver())
    monkeypatch.setattr("src.optimization.tasks.get_shipment_updates_channel", lambda: "shipment-updates")

    problem_dict = {
        "origin": [40.7128, -74.0060],
        "stops": [
            {"stop_id": "stop-1", "lat": 40.73, "lng": -74.0},
            {"stop_id": "stop-2", "lat": 40.74, "lng": -73.99},
        ],
    }

    result = solve_routing_job.run("job-1", "order-1", "tenant-1", problem_dict)

    assert result["status"] == "success"
    assert result["result"]["solver_status"] == "feasible"
    assert fake_redis.hset.call_count == 2
    assert fake_redis.publish.call_count == 2


def test_celery_task_soft_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_redis = MagicMock()
    fake_redis.hset = MagicMock()
    fake_redis.publish = MagicMock()

    class TimeoutSolver:
        def solve(self, problem: RoutingProblem) -> RoutingResult:
            raise SoftTimeLimitExceeded()

    monkeypatch.setattr("redis.Redis.from_url", lambda *args, **kwargs: fake_redis)
    monkeypatch.setattr("src.optimization.tasks.VRPSolver", lambda timeout_seconds=5: TimeoutSolver())
    monkeypatch.setattr("src.optimization.tasks.get_shipment_updates_channel", lambda: "shipment-updates")

    problem_dict = {
        "origin": [40.7128, -74.0060],
        "stops": [{"stop_id": "stop-1", "lat": 40.73, "lng": -74.0}],
    }

    with pytest.raises(SoftTimeLimitExceeded):
        solve_routing_job.run("job-2", "order-2", "tenant-2", problem_dict)

    assert fake_redis.hset.call_count == 2
    assert fake_redis.publish.call_count == 2


def test_celery_task_retry_on_error(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_redis = MagicMock()
    fake_redis.hset = MagicMock()
    fake_redis.publish = MagicMock()

    class ErrorSolver:
        def solve(self, problem: RoutingProblem) -> RoutingResult:
            raise RuntimeError("boom")

    class RetryRaised(Exception):
        pass

    monkeypatch.setattr("redis.Redis.from_url", lambda *args, **kwargs: fake_redis)
    monkeypatch.setattr("src.optimization.tasks.VRPSolver", lambda timeout_seconds=5: ErrorSolver())
    monkeypatch.setattr("src.optimization.tasks.get_shipment_updates_channel", lambda: "shipment-updates")

    monkeypatch.setattr(solve_routing_job, "retry", lambda **kwargs: RetryRaised("retry"))

    problem_dict = {
        "origin": [40.7128, -74.0060],
        "stops": [{"stop_id": "stop-1", "lat": 40.73, "lng": -74.0}],
    }

    with pytest.raises(RetryRaised):
        solve_routing_job.run("job-3", "order-3", "tenant-3", problem_dict)

    assert fake_redis.hset.call_count == 2
    assert fake_redis.publish.call_count == 2