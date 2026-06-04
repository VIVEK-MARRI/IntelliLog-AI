from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone

import fakeredis.aioredis
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("SKIP_EXTERNAL_STARTUP_CHECKS", "true")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-testing-only-do-not-use-in-prod")

from src.api.auth import create_access_token
from src.api.deps import get_db, get_prediction_service, get_redis
from src.api.main import app
from src.ml.feature_engineering import FeatureBuilder, FeatureStats
from src.ml.inference import PredictionResult, PredictionService

from tests.fixtures.factories import DriverStatsFactory, LiveOrderStateFactory
from tests.fixtures.fake_db import FakeAsyncSession


class StubPredictionModel:
    def __init__(self, score: float) -> None:
        self.score = score

    def predict_proba(self, features):
        import numpy as np

        return np.array([[1.0 - self.score, self.score] for _ in range(len(features))])


class StubExplainer:
    def __init__(self, shap_values: list[float]) -> None:
        self.shap_values_data = shap_values

    def shap_values(self, features):
        import numpy as np

        return np.array([self.shap_values_data])


class StubPredictionService:
    def __init__(self, risk_score: float = 0.82) -> None:
        feature_builder = FeatureBuilder()
        feature_names = feature_builder.get_feature_names()
        self.feature_builder = feature_builder
        self.feature_names = feature_names
        self.model_version = "test-model-1"
        self.optimal_threshold = 0.7
        self.feature_stats = FeatureStats(
            feature_medians={name: 0.5 for name in feature_names},
            feature_mins={name: 0.0 for name in feature_names},
            feature_maxs={name: 1.0 for name in feature_names},
        )
        self.model = StubPredictionModel(risk_score)
        self._explainer = StubExplainer([0.9, -0.6, 0.4, 0.3, -0.2, 0.1, 0.05, 0.04, 0.03, 0.02, 0.01, 0.0, -0.01, -0.02])

    def _get_explainer(self):
        return self._explainer

    def _extract_top_factors(self, shap_values, features, top_k: int = 5):
        return PredictionService._extract_top_factors(self, shap_values, features, top_k)

    def predict_with_shap(self, order_id: str, features: dict[str, float]) -> PredictionResult:
        return PredictionService.predict_with_shap(self, order_id, features)


@pytest.fixture
def tenant_id() -> str:
    return str(uuid.uuid4())


@pytest.fixture
def auth_headers(tenant_id: str) -> dict[str, str]:
    token = create_access_token(tenant_id=tenant_id, name="Test Tenant")
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def test_redis():
    client = fakeredis.aioredis.FakeRedis(decode_responses=True)
    yield client
    await client.flushdb()
    await client.close()


@pytest_asyncio.fixture
async def binary_test_redis():
    client = fakeredis.aioredis.FakeRedis(decode_responses=False)
    yield client
    await client.flushdb()
    await client.close()


@pytest_asyncio.fixture
async def fake_db_session():
    yield FakeAsyncSession()


@pytest.fixture
def prediction_service_stub() -> StubPredictionService:
    return StubPredictionService()


@pytest_asyncio.fixture
async def api_client(fake_db_session, test_redis, prediction_service_stub):
    async def override_get_db():
        yield fake_db_session

    async def override_get_redis():
        return test_redis

    async def override_get_prediction_service():
        return prediction_service_stub

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_redis] = override_get_redis
    app.dependency_overrides[get_prediction_service] = override_get_prediction_service

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client

    app.dependency_overrides.clear()


@pytest.fixture
def live_order_state() -> dict[str, float]:
    return LiveOrderStateFactory()


@pytest.fixture
def driver_stats() -> dict[str, float]:
    return DriverStatsFactory()
