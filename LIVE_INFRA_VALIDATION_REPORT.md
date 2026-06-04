# Live Infrastructure Validation Report

## PostgreSQL
PASS

PostgreSQL was initialized locally from `tmp_pg_data` and started on port `5433`. Alembic migrations applied successfully and the `orders` row created during validation is present in the live database.

Evidence:
- `alembic current` returned `001 (head)`.
- Live order record exists in `orders` with ID `57c76133-249e-49eb-b877-1fe61062630c`.

## Redis
PASS

Redis 8.8.0 for Windows was downloaded and started locally on `127.0.0.1:6379` with AOF persistence enabled.

Validation:
- `redis-cli ping` returned `PONG`.
- A direct pub/sub probe on `tenant:tenant-001:events` received the published payload.

## FastAPI
PASS

The API started successfully against the live Postgres and Redis instances.

Validated endpoints:
- `GET /health` -> `healthy`
- `GET /health/live` -> `{"status":"alive"}`
- `GET /health/ready` -> `{"status":"ready"...}`
- `GET /metrics` -> `200`

## WebSocket
PASS

Real WebSocket connections were established for the tenant channel and Redis events were forwarded to the browser client.

Validated behavior:
- Connection established to `/ws/11111111-1111-1111-1111-111111111111`
- Broadcast channel: `tenant:11111111-1111-1111-1111-111111111111:events`
- Event types observed in browser: `order_created`, `prediction_updated`

## Frontend
PASS

The rebuilt frontend rendered the login page and dashboard, authenticated successfully, and displayed the live order in the dashboard after a real API create-order call.

Validated behavior:
- Login page renders.
- Authenticated dashboard loads.
- FleetMap and OrderTable render.
- One live order appears in the dashboard after backend order creation.
- WebSocket-driven risk update reflected in the UI.

## Prometheus
FAIL

Root cause:
- Docker Desktop engine is unavailable on this machine, so the repository's containerized monitoring stack cannot be launched.

Applied fix:
- Exposed `/metrics` directly on FastAPI so application metrics are still available.

Remaining blocker:
- No standalone Prometheus binary was brought up in this environment.

## Grafana
FAIL

Root cause:
- Same Docker Desktop engine blocker as Prometheus.

Applied fix:
- None required for the application runtime.

Remaining blocker:
- No Grafana instance could be started without Docker or a separate local installation.

## End-To-End Workflow
PASS

Validated live flow:
1. Create order
2. Persist to PostgreSQL
3. Publish to Redis
4. Broadcast over WebSocket
5. Render in frontend dashboard

Captured results:
- Create order HTTP response: `200`
- Backend order insert persisted in Postgres
- Redis publish succeeded
- Browser dashboard updated to show the created order
- WebSocket delivered live events to the tenant channel

## Notes

The frontend UI shows the live order and the risk update, but the dashboard still uses a simplified backend mapping for some fields because the backend returns a slimmer live-order payload than the frontend originally expected.