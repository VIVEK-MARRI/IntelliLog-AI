# IntelliLog-AI Test Suite

## Quick Start

### Local (no Docker required)

Unit, e2e, and API tests use `fakeredis` and `httpx` in-process — no running services needed.

```bash
# From the project root, with the venv activated:
pytest tests/ -q --ignore=tests/integration --ignore=tests/performance
```

### Docker / CI (full suite against real Postgres + Redis)

```bash
docker compose up -d          # Start all services
pytest tests/ -q              # Full suite — integration tests auto-detect live DB
```

### With explicit connection overrides

```bash
DATABASE_URL="postgresql+asyncpg://intelliglog:dev-password@localhost:5432/intelliglog" \
REDIS_URL="redis://localhost:6379" \
pytest tests/ -q
```

## Test Categories

| Directory | Marker | Needs Docker? | Description |
|-----------|--------|---------------|-------------|
| `tests/unit/` | (none) | No | Pure unit tests, fakeredis |
| `tests/api/` | (none) | No | FastAPI endpoint tests, fakeredis |
| `tests/e2e/` | `e2e` | No | End-to-end scenario tests, fakeredis |
| `tests/integration/` | `integration` | Yes | Real Postgres + Redis round-trips |
| `tests/performance/` | `performance` | No | Throughput/latency tests, fakeredis |

## Running Specific Categories

```bash
# Unit tests only
pytest tests/unit/ -q

# Exclude integration + performance for fast local feedback
pytest tests/ -q -m "not integration and not performance"

# Integration only (requires Docker)
pytest tests/integration/ -q

# E2e only
pytest tests/e2e/ -q
```

## What the Fixtures Provide

- `test_redis` — async fakeredis (decode_responses=True, string mode)
- `binary_test_redis` — async fakeredis (decode_responses=False, bytes mode for StateManager)
- `api_client` — httpx AsyncClient wired to FastAPI app with fakeredis + StubPredictionService
- `auth_headers` — headers dict for dev-bypassed auth
- `tenant_id` — the dev tenant slug `"dev-tenant-id"`
- `client` — sync TestClient for integration tests against live Docker services

## Environment Variables

| Variable | Default (local) | Docker value |
|----------|-----------------|--------------|
| `DATABASE_URL` | `postgresql+asyncpg://intelliglog:dev-password@localhost:5432/intelliglog` | `postgresql+asyncpg://intelliglog:dev-password@postgres:5432/intelliglog` |
| `REDIS_URL` | `redis://localhost:6379` | `redis://redis:6379` |
| `SECRET_KEY` | `test-secret-not-for-production` | set in docker-compose.yml |
| `SKIP_EXTERNAL_STARTUP_CHECKS` | `true` | `true` |
