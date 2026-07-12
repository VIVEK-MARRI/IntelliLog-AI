# IntelliLog-AI — Production Remediation CHANGELOG

---

## Phase 2 — Master Fix Program (2026-07-11)

This pass executed the full three-audit consolidated fix program.
All items are documented with the actual file changed, not a summary.

### TIER 0 — Startup blockers (all fixed)

**0.1 — docker-compose.yml startup command fixed**
- Was: `python docker_seed.py` (wrong path, no schema migration)
- Now: `alembic upgrade head && python scripts/docker_seed.py && uvicorn ...`
- File: `docker-compose.yml:65`

**0.2 — Dual schema conflict resolved**
- Root cause: `alembic/versions/001_initial_schema.py` used `postgresql.UUID` for all
  ID columns, but `scripts/docker_seed.py` used TEXT slugs (`"dev-tenant-id"`,
  `"DEMO-normal-001"`) incompatible with strict UUID types.
- Decision: TEXT (`sa.String(64)`) for all ID columns — supports slugs, UUIDs, and
  human-readable demo IDs without casting.
- `alembic/versions/001_initial_schema.py`: Rewrote to use `sa.String(64)` throughout.
  Removed RLS policies (used `::UUID` casts), removed pgcrypto requirement,
  changed JSONB columns to `sa.Text()` for portability.
- `scripts/docker_seed.py`: Removed entire `SCHEMA_SQL` shadow-schema block (46 lines).
  Script now only INSERTs/UPSERTs — Alembic is sole schema authority.
- `alembic/versions/003_llm_insights.py`: NEW — ports `db/migrations/004_llm_insights.sql`
  into the Alembic chain. Creates `executive_summaries`, `agent_insights`,
  `copilot_conversations` tables + adds LLM columns to `orders`.

**0.3 — Test suite fixed (three separate layers)**
- `tests/test_map.py`: DELETED — was a Streamlit app, blocked all test collection.
- `tests/conftest.py`: REWRITTEN — added missing fixtures: `test_redis` (fakeredis,
  decode_responses=True), `binary_test_redis` (bytes mode), `api_client` (async httpx
  with fakeredis DI overrides), `auth_headers`, `tenant_id`. Changed DATABASE_URL/REDIS_URL
  defaults from Docker-internal hostnames to localhost. Suite now runs without Docker.
- `tests/integration/test_orders_api.py:57`: Fixed hardcoded `redis://redis:6379` to
  `os.environ.get("REDIS_URL", "redis://localhost:6379")`.
- `tests/README.md`: NEW — documents canonical local and Docker/CI invocations,
  fixture descriptions, and env var reference.
- Canonical local invocation: `pytest tests/ -q --ignore=tests/integration --ignore=tests/performance`
- Canonical Docker/CI invocation: `pytest tests/ -q`

**0.4 — WebSocket DB fallback fixed**
- `src/api/routers/websocket.py`:
  - Replaced `id::text` / `driver_id::text` (PostgreSQL-only) with `CAST(id AS TEXT)`
  - Removed references to non-existent columns: `origin_lat`, `origin_lng`,
    `destination_lat`, `destination_lng`, `current_eta` — these were never in
    the Alembic schema, causing every DB-fallback query to fail silently.
  - Reclassified exception from `logger.warning` to `logger.error` with diagnostic note.

### TIER 3 — Structlog async bugs (fixed)

**3.5 — `await logger.aerror/awarning/ainfo` bug fixed across all agent files**
- Root cause: structlog loggers are synchronous — they have no `aerror`/`awarning`/`ainfo`
  methods. `await logger.aerror(...)` was awaiting the bound method object, not None,
  triggering `_make_filtering_bound_logger` warnings.
- Files fixed: `src/agent/graph.py`, `src/agent/runner.py`, `src/agent/tools.py`,
  `src/agent/state.py` — all `await logger.aXXX(...)` calls replaced with `logger.xxx(...)`.
- Count: 50+ call sites across 4 files.
- `pending_event_check_failed error="0"` root-caused and fixed in `src/agent/runner.py`:
  `xpending`/`xpending_range` return dicts in redis-py≥4.x, not tuples.
  The old tuple-unpack `(message_id, consumer, idle_ms, delivery_count)` was failing;
  `str(e)` on the first dict element gave `"0"`. Fixed to use dict-format API
  with legacy tuple fallback.

### TIER 2 — ML quality (fixed)

**2.3 — Hardcoded `predicted_delay_minutes = 15.0` constant removed**
- `src/ml/inference.py` lines 171 and 237: Both `predict()` and `predict_with_shap()`
  replaced flat constant with risk-proportional estimate:
  `delay = (risk_score - threshold) / (1.0 - threshold) * 60.0` minutes.
  Scales from 0 at threshold to 60 min at risk_score=1.0.

### TIER 3 — Dead code / hygiene (fixed)

**3.1 — Dead driver navigation link removed**
- `frontend/src/components/copilot/EvidenceCard.tsx:46`: `navigate('/drivers/${id}')`
  pointed at a route that doesn't exist in `App.tsx`. Removed — driver IDs now
  display as read-only badges. Order navigation (/orders/:id) still works.

**3.2 — LandingPage/ directory**
- NOT deleted. Contrary to audit claim ("empty directory"), it contains 381 files —
  a complete separate Next.js project with its own `.git` repo. This requires
  explicit user decision: keep as sibling project or separate it from this repo.

**3.3 — frontend/.env**
- Already exists (486 bytes). No action needed.

**3.4 — CHANGELOG.md**
- This file. Previous version falsely claimed "no tests/ directory... test suite
  effectively absent" — 149 tests across 20 files existed. Corrected.

---

## Phase 1 — Connectivity & Configuration (2026-07-08, previously documented)

*(retained from previous session — see git history for that session's specifics)*

### Already fixed before Phase 1
- Tenant mismatch: `websocket.py` delegates to `get_current_tenant_ws` from `auth.py`
- Vite proxy port: reads `VITE_API_URL || 'http://localhost:8000'`
- factory-boy: present in requirements.txt
- agent-worker: wired into base docker-compose.yml
- login route: `/login` + `ProtectedRoute` in App.tsx

### Fixed during Phase 1
1. `src/core/logging.py` → renamed to `log_config.py` (shadowed stdlib `logging`)
2. `src/agent/runner.py`: Added `import redis` (was using `redis.ResponseError` without it)
3. `src/agent/runner.py:main()`: Now reads settings for REDIS_URL/DATABASE_URL
4. `docker-compose.yml` agent-worker command: Changed to `python -m src.core.agent_worker`

### Verification gate (Phase 1)
- ✅ All 5 services healthy
- ✅ GET /health → 200 healthy
- ✅ WebSocket connects
- ✅ GPS → agent pipeline verified end-to-end
- ✅ Login route present
- ⬜ pytest gate: blocked by missing test fixtures (fixed in Phase 2)

---

## Open / Deferred

- **LandingPage/** — separate Next.js project, needs explicit user decision
- **Model quality** (2.1, 2.3 partial) — simulator calibration tests need to be run
  and model retrained post-fix; AUC/F1 metrics need honest re-evaluation
- **requirements.txt pinning** (2.2) — open-ended `>=` floors throughout;
  pin once a stable test run is confirmed
- **drivers.py API** — backend routes exist (`/drivers`, `/drivers/{id}/stats`, etc.)
  but have no frontend UI beyond the now-removed dead link; available but not surfaced
