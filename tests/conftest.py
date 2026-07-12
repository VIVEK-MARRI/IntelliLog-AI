"""Shared pytest fixtures for the IntelliLog-AI test suite.

## Running the suite

### Local (no Docker required) — unit, e2e, and API tests with fakeredis
    pytest tests/ -q --ignore=tests/integration --ignore=tests/performance

### Docker / CI — full suite against real Postgres + Redis
    docker compose up -d
    pytest tests/ -q

The integration tests under tests/integration/ require a real PostgreSQL
instance. They probe several candidate URLs automatically and skip if none
are reachable. Set DATABASE_URL and REDIS_URL to override the defaults.
"""
import os

# ------------------------------------------------------------------ #
# Environment defaults — localhost so the suite runs without Docker. #
# Override with DATABASE_URL / REDIS_URL env vars for real services. #
# ------------------------------------------------------------------ #
os.environ.setdefault("SKIP_EXTERNAL_STARTUP_CHECKS", "true")
os.environ.setdefault("SECRET_KEY", "test-secret-not-for-production")
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://intelliglog:dev-password@localhost:5432/intelliglog",
)
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")

import numpy as np
import pytest
import fakeredis.aioredis as fakeredis
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


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
        self.model_version = "test-model-1"
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
        self.model_version = "test-model-1"

    def predict_with_shap(self, order_id: str, features: dict[str, float]) -> StubPredictionResult:
        return StubPredictionResult(order_id)


# ---------------------------------------------------------------------------
# Core infrastructure fixtures
# ---------------------------------------------------------------------------

DEV_TENANT_ID = "dev-tenant-id"


@pytest.fixture
def tenant_id() -> str:
    """The dev-mode tenant slug used by auth.py's SKIP_EXTERNAL_STARTUP_CHECKS bypass."""
    return DEV_TENANT_ID


@pytest.fixture
def auth_headers(tenant_id: str) -> dict[str, str]:
    """Minimal auth headers for dev-mode endpoints (no JWT needed)."""
    return {"X-Tenant-Id": tenant_id}


@pytest.fixture
async def test_redis():
    """
    Fakeredis instance with decode_responses=True.

    Use for tests that read Redis values as strings (most tests).
    This is an async fakeredis — compatible with redis.asyncio API.
    """
    server = fakeredis.FakeServer()
    client = fakeredis.FakeRedis(server=server, decode_responses=True)
    yield client
    await client.aclose()


@pytest.fixture
async def binary_test_redis():
    """
    Fakeredis instance with decode_responses=False (bytes mode).

    Use for tests that interact with StateManager, which stores
    binary-encoded msgpack data.
    """
    server = fakeredis.FakeServer()
    client = fakeredis.FakeRedis(server=server, decode_responses=False)
    yield client
    await client.aclose()


@pytest.fixture
async def api_client(test_redis):
    """
    Async HTTP client wired to the FastAPI app with DI overrides.

    - Uses fakeredis (no real Redis required)
    - Uses StubPredictionService (no real model files required)
    - Uses aiosqlite in-memory database (no real Postgres required)
    - Auth is dev-bypassed via SKIP_EXTERNAL_STARTUP_CHECKS=true
    """
    from src.api.main import app
    from src.api.deps import get_redis, get_prediction_service, get_db
    from src.api import schemas  # noqa — trigger schema registration if needed

    # Build an in-memory SQLite engine for this test session.
    # aiosqlite is much lighter than spinning up Postgres for unit tests.
    test_engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )

    # Import all SQLAlchemy models so metadata is populated
    try:
        from sqlalchemy import text as _text
        async with test_engine.begin() as conn:
            # This project uses raw SQL (not ORM models), so we create the
            # minimum set of tables needed by unit/API tests explicitly.
            # Uses SQLite-compatible DDL (no UUID, JSONB, or Postgres-specific types).
            await conn.execute(_text("""
                CREATE TABLE IF NOT EXISTS tenants (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    api_key_hash TEXT NOT NULL,
                    email TEXT,
                    password_hash TEXT,
                    is_active INTEGER DEFAULT 1,
                    created_at TEXT DEFAULT (datetime('now'))
                )
            """))
            await conn.execute(_text("""
                CREATE TABLE IF NOT EXISTS drivers (
                    id TEXT NOT NULL,
                    tenant_id TEXT NOT NULL,
                    name TEXT,
                    historical_on_time_rate REAL DEFAULT 0.85,
                    total_deliveries INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT (datetime('now')),
                    PRIMARY KEY (id, tenant_id)
                )
            """))
            await conn.execute(_text("""
                CREATE TABLE IF NOT EXISTS orders (
                    id TEXT NOT NULL,
                    tenant_id TEXT NOT NULL,
                    driver_id TEXT,
                    status TEXT DEFAULT 'pending',
                    planned_stops INTEGER NOT NULL DEFAULT 1,
                    completed_stops INTEGER DEFAULT 0,
                    planned_eta TEXT NOT NULL,
                    actual_eta TEXT,
                    current_risk_score REAL DEFAULT 0.0,
                    llm_insight TEXT,
                    llm_risk_drivers TEXT DEFAULT '[]',
                    llm_suggested_actions TEXT DEFAULT '[]',
                    llm_severity TEXT,
                    generated_insight TEXT,
                    risk_level_label TEXT,
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now')),
                    PRIMARY KEY (id, tenant_id)
                )
            """))
            await conn.execute(_text("""
                CREATE TABLE IF NOT EXISTS gps_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tenant_id TEXT NOT NULL,
                    order_id TEXT NOT NULL,
                    driver_id TEXT NOT NULL,
                    latitude REAL NOT NULL,
                    longitude REAL NOT NULL,
                    speed_kmh REAL DEFAULT 0,
                    heading_degrees REAL,
                    event_type TEXT DEFAULT 'ping',
                    recorded_at TEXT NOT NULL,
                    sequence_number INTEGER
                )
            """))
            await conn.execute(_text("""
                CREATE TABLE IF NOT EXISTS predictions (
                    id TEXT PRIMARY KEY,
                    order_id TEXT NOT NULL,
                    tenant_id TEXT NOT NULL,
                    risk_score REAL NOT NULL,
                    is_high_risk INTEGER NOT NULL,
                    confidence REAL NOT NULL,
                    top_risk_factors TEXT DEFAULT '[]',
                    predicted_delay_minutes REAL NOT NULL,
                    model_version TEXT,
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now'))
                )
            """))
            await conn.execute(_text("""
                CREATE TABLE IF NOT EXISTS agent_decisions (
                    id TEXT PRIMARY KEY,
                    order_id TEXT NOT NULL,
                    tenant_id TEXT NOT NULL,
                    decided_at TEXT DEFAULT (datetime('now')),
                    risk_score REAL NOT NULL,
                    decision TEXT NOT NULL,
                    reasoning TEXT DEFAULT '{}',
                    tools_called TEXT DEFAULT '[]',
                    outcome TEXT,
                    model_version TEXT
                )
            """))
            await conn.execute(_text("""
                CREATE TABLE IF NOT EXISTS route_plans (
                    id TEXT NOT NULL,
                    order_id TEXT NOT NULL,
                    tenant_id TEXT NOT NULL,
                    created_at TEXT DEFAULT (datetime('now')),
                    waypoints TEXT DEFAULT '[]',
                    total_distance_km REAL,
                    total_duration_minutes REAL,
                    solver_status TEXT,
                    solver_duration_ms INTEGER,
                    PRIMARY KEY (id, tenant_id)
                )
            """))
            # Seed the dev tenant so auth lookups succeed
            await conn.execute(_text("""
                INSERT OR IGNORE INTO tenants (id, name, api_key_hash, is_active)
                VALUES ('dev-tenant-id', 'Dev Tenant',
                        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                        1)
            """))
    except Exception as e:
        # Log but don't crash — tests will fail with informative errors if needed
        import warnings
        warnings.warn(f"Could not create test DB tables: {e}")

    TestSessionLocal = async_sessionmaker(
        test_engine, class_=AsyncSession, expire_on_commit=False
    )

    async def _override_get_redis():
        return test_redis

    async def _override_get_prediction_service():
        return StubPredictionService()

    async def _override_get_db():
        async with TestSessionLocal() as session:
            yield session

    app.dependency_overrides[get_redis] = _override_get_redis
    app.dependency_overrides[get_prediction_service] = _override_get_prediction_service
    app.dependency_overrides[get_db] = _override_get_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        yield client

    app.dependency_overrides.clear()
    await test_engine.dispose()


# ---------------------------------------------------------------------------
# Session-scoped TestClient (live Docker services — integration tests only)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def client():
    """Sync TestClient against live Docker services (integration tests).

    Requires real PostgreSQL + Redis to be running.
    Use the `api_client` async fixture for unit/e2e tests instead.
    """
    from fastapi.testclient import TestClient
    from src.api.main import app

    with TestClient(app) as c:
        yield c
