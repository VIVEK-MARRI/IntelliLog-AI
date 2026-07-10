# IntelliLog-AI — Production Readiness Remediation CHANGELOG

## Audit snapshot note
The provided audit is dated **2026-07-05**. The working tree is **2026-07-08** and is
substantially ahead of the audit: most of Phase 1's catalogued defects were already
remediated before this session. This log records what was *verified* and what was
*newly fixed* during Phase 1 execution.

---

## PHASE 1 — Connectivity & Configuration

### Already fixed in snapshot (verified, not regressed)
- **#1 Tenant mismatch**: `websocket.py` delegates to `get_current_tenant_ws` from
  `auth.py` (only `_authenticate_ws` mentions remain in comments). Single source of
  truth confirmed.
- **#8 vite proxy port**: `vite.config.ts` reads `env.VITE_API_URL || 'http://localhost:8000'`.
  No hardcoded 8100.
- **#11 factory-boy**: present at `requirements.txt:69`.
- **#9 agent-worker**: wired into base `docker-compose.yml` (redis + agent-worker services).
- **#10 login route**: `/login` route + `ProtectedRoute` present in `App.tsx`.

### Newly fixed during Phase 1 verification (NOT in the stale audit)
1. **`src/core/logging.py` shadowed Python stdlib `logging`** — when the agent-worker ran
   as `python src/core/agent_worker.py`, `src/core` landed on `sys.path[0]` and
   `import logging` resolved to the local file, crashing at `import logging.config`.
   Fix: renamed module to `src/core/log_config.py` (dead code, never imported; rename
   removes the footgun). Evidence: agent-worker now starts past import.
2. **`src/agent/runner.py:172` referenced `redis.ResponseError` without `redis` imported**
   (only `Redis` was imported). Fix: added `import redis`.
   Evidence: worker got past group-create; previously `NameError: name 'redis' is not defined`.
3. **`src/agent/runner.py:main()` constructed `AgentRunner()` with hardcoded
   `redis://localhost` / `localhost/db` defaults**, ignoring `REDIS_URL`/`DATABASE_URL`.
   Fix: `main()` now reads settings and passes them through.
   Evidence: worker connected to `redis://redis:6379` (compose host) instead of localhost.
4. **`docker-compose.yml` agent-worker command** was `python src/core/agent_worker.py`
   (put `src/core` on path → `No module named 'src'`). Fix: `python -m src.core.agent_worker`.
   Evidence: worker now imports `src.agent.runner`.

### Verification gate — results
- OK `docker compose up -d` brings up **postgres, redis, backend, frontend, agent-worker** all healthy.
- OK `GET /health` -> 200 (`{"status":"healthy",...}`).
  - NOTE: audit gate command `curl .../api/v1/health` is **wrong** — real route is `/health`
    (mounted without prefix in `main.py:257`). System is correct; gate command was inaccurate.
- OK WebSocket connects (observed earlier this session).
- OK **End-to-end GPS->agent verified**: `PATCH /api/v1/orders/DEMO-incident-007/position`
  returned 200; agent-worker consumed the `gps_pings` stream event and ran the graph
  (`event_processed decision=None order_id=DEMO-incident-007`).
- OK Login route present.
- BLOCKED **pytest gate (#6)**: `testpaths = ["tests"]` but no `tests/` directory exists.
  Root `test_map.py` is a Streamlit app (not a test); `test_ml_model.py` is a print-script.
  `pytest --collect-only` -> "no tests collected". Test suite is effectively absent.

### Minor non-fatal agent-worker warnings (noted, not yet fixed)
- `update_order_state_failed error="_make_filtering_bound_logger..."` — a structlog call
  passes `event` as both positional and keyword arg (logging bug in worker).
- `pending_event_check_failed error=0` — benign recurring warning (`str(e)` == "0").

### Deferred — needs user decision
- **Test suite is missing.** The audit assumed `tests/unit/test_utils.py` etc. exist; they
  do not in this snapshot. Options: (a) recreate a real pytest suite, (b) restore from a
  known source, (c) accept script-style validation only. This blocks gate #6.
