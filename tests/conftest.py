"""Shared pytest fixtures for the IntelliLog-AI test suite.

Tests run against the *live* Docker services (postgres + redis) that
`docker compose up` provisions, using FastAPI's in-process TestClient so
no HTTP port/proxy is involved. Dev-mode bypass is enabled so no JWT is
required for the endpoints under test.
"""
import os

# Ensure a deterministic dev-mode environment before importing the app.
os.environ.setdefault("SKIP_EXTERNAL_STARTUP_CHECKS", "true")
os.environ.setdefault("SECRET_KEY", "test-secret-not-for-production")
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://intelliglog:dev-password@postgres:5432/intelliglog"
)
os.environ.setdefault("REDIS_URL", "redis://redis:6379")

import numpy as np
import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Custom pytest markers
# ---------------------------------------------------------------------------
def pytest_configure(config):
    config.addinivalue_line("markers", "integration: mark test as requiring Docker containers")
    config.addinivalue_line("markers", "websocket: WebSocket-specific test")
    config.addinivalue_line("markers", "performance: performance / throughput test")
    config.addinivalue_line("markers", "e2e: end-to-end scenario test")


# ---------------------------------------------------------------------------
# Stub classes used by the original test suite
# ---------------------------------------------------------------------------

class StubPredictionModel:
    """Returns a fixed risk score from predict_proba."""
    def __init__(self, score: float) -> None:
        self.score = score

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        return np.array([[1.0 - self.score, self.score]], dtype=float)


class StubExplainer:
    """Returns fixed SHAP values."""
    def __init__(self, shap_values: list[float]) -> None:
        self._shap_values = np.array([shap_values])

    def shap_values(self, X: np.ndarray) -> np.ndarray:
        return self._shap_values


class _StubFeatureBuilder:
    """Minimal FeatureBuilder stand-in for StubPredictionService."""
    @staticmethod
    def build_from_live(order_state: dict, driver_stats: dict) -> dict[str, float]:
        return {}


class StubPredictionResult:
    """Minimal PredictionResult stand-in."""
    def __init__(self, order_id: str) -> None:
        self.order_id = order_id
        self.risk_score = 0.5
        self.is_high_risk = False
        self.confidence = "medium"
        self.top_risk_factors = []
        self.predicted_delay_minutes = 0.0
        self.model_version = "stub"
        self.inference_latency_ms = 0.0


class StubPredictionService:
    """Stand-in PredictionService that returns canned results.

    Used by test_live_stack.py (DI override for predictions endpoint),
    test_events.py (subclassed by StartupPredictionService),
    and test_ws_tenant_consistency.py (fixture override).
    """
    def __init__(self, model_dir: str = "models/") -> None:
        self.model_dir = model_dir
        self.feature_builder = _StubFeatureBuilder()
        self.optimal_threshold = 0.7
        self.model_version = "stub"

    def predict_with_shap(self, order_id: str, features: dict[str, float]) -> StubPredictionResult:
        return StubPredictionResult(order_id)


# ---------------------------------------------------------------------------
# Session-scoped TestClient (live Docker services)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def client():
    from src.api.main import app

    with TestClient(app) as c:
        yield c
