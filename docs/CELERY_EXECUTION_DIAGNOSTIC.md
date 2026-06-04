# Celery Execution Diagnostic

Date: 2026-06-01

Summary: I inspected the running Celery worker, tested broker connectivity, attempted a fresh optimize submission, and collected evidence. The optimization request did not enqueue because the API process was configured to use a different Redis instance for Celery (port 6380) which is not running. The Celery worker itself is running and healthy on Redis 127.0.0.1:6379.

**Checks performed**
- Celery `inspect ping`: worker reachable when using correct broker env -> PASS for worker availability
- Celery `inspect active|reserved|scheduled`: no active/reserved tasks at time of checks -> PASS (idle)
- Celery `inspect active_queues`: worker consuming queue `celery` -> PASS
- Celery `inspect registered`: `src.optimization.tasks.solve_routing_job` registered -> PASS
- Attempted POST /api/v1/routes/optimize: request timed out (client observed ReadTimeout) -> FAIL (task never enqueued)
- Redis broker (127.0.0.1:6379) ping and worker connectivity: OK (worker stats show broker port 6379) -> PASS

---

### Evidence (command outputs)

Celery ping (explicit broker env):

```
->  celery@VICKYS-VICTUS: OK
        pong

1 node online.
```

Celery active (no tasks):

```
->  celery@VICKYS-VICTUS: OK
    - empty -

1 node online.
```

Celery queues (active_queues):

```
* {'name': 'celery', 'exchange': {'name': 'celery', 'type': 'direct', ...}}

1 node online.
```

Celery registered tasks:

```
* src.optimization.tasks.solve_routing_job

1 node online.
```

Celery stats (shows broker port and pool):

```
"broker": { ..., "port": 6379, "transport": "redis" }
"pool": { "implementation": "celery.concurrency.solo:TaskPool" }
```

API POST /routes/optimize attempt (client output):

```
requests.exceptions.ReadTimeout: HTTPConnectionPool(host='127.0.0.1', port=8000): Read timed out. (read timeout=10)
```

Redis keys summary (pre-submit): small set; no optimization job key created because enqueue did not succeed.

`.env` relevant lines (workspace .env):

```
# CELERY REDIS (separate instance on port 6380)
CELERY_BROKER_URL=redis://localhost:6380/0
CELERY_RESULT_BACKEND=redis://localhost:6380/0
```

---

### Task Queued

- Result: FAIL
- Reason: The API process attempted to enqueue a Celery task but the configured `CELERY_BROKER_URL` from the environment (.env) pointed at `localhost:6380` where no broker was listening. The enqueue call blocked/failed and the HTTP request timed out before returning a job id.

### Worker Consumption

- Result: PASS (worker is running and idle)
- Details: Worker `celery@VICKYS-VICTUS` is connected to Redis on port 6379 and consumes the `celery` queue. Registered task `src.optimization.tasks.solve_routing_job` is present.

### Task Execution

- Result: FAIL (no task delivered from API)
- Details: Since the API attempted to talk to `localhost:6380` for Celery broker, the worker (on 6379) never received the task.

### Route Persistence

- Result: NOT APPLICABLE (task never ran). If the task runs, it will attempt to persist into `route_plans` in Postgres; that will need validation after the worker completes.

---

### Root Cause

The API process is reading Celery broker configuration from the workspace `.env` (or from its process environment) where `CELERY_BROKER_URL` is set to `redis://localhost:6380/0`. The running Celery worker was started with environment variables pointing to `redis://127.0.0.1:6379/0` and is connected to Redis on port 6379. Because the API used a different broker address (6380) where no Redis service is running, attempts to enqueue tasks blocked/failed and the HTTP request timed out.

Symptoms observed:
- `celery inspect` without overriding env failed connecting to localhost:6380 (connection refused).
- Overriding env to `redis://127.0.0.1:6379/0` made `inspect ping` succeed.
- HTTP POST to `/routes/optimize` timed out and returned no job id.

### Applied Fix

No code changes applied yet. I did the diagnosis only (per your request). Recommended fixes are below.

### Recommended Immediate Fix (non-destructive)

Option A (recommended for local dev):
- Update the environment used to start the API so Celery broker matches the running Redis instance. Set `CELERY_BROKER_URL` and `CELERY_RESULT_BACKEND` to `redis://127.0.0.1:6379/0` (or `redis://localhost:6379/0`) before starting the API (or export in the shell/PowerShell session used to start `uvicorn`).

PowerShell example (set env then start uvicorn):

```
$env:CELERY_BROKER_URL='redis://127.0.0.1:6379/0'
$env:CELERY_RESULT_BACKEND='redis://127.0.0.1:6379/0'
.venv\Scripts\uvicorn.exe src.api.main:app --host 127.0.0.1 --port 8000 --reload
```

Option B:
- Start a Redis instance listening on port 6380 so the API's current `CELERY_BROKER_URL` becomes valid. This is less recommended because it masks config drift.

After applying either fix, re-run the steps in this diagnostic: submit a fresh `/routes/optimize` request (without increasing timeouts), check `optimization:job:{job_id}` in Redis, and use `celery inspect active reserved` to confirm worker consumption.

### Next Validation Step

1. Apply Option A (set API env to use 127.0.0.1:6379 for Celery broker) and restart the API process.
2. Submit a fresh optimization request (same payload as earlier). Observe:
   - API returns job id immediately (PASS Task Queued)
   - `celery inspect reserved` or `active` shows the task being reserved/executing (PASS Worker Consumption)
   - Worker logs show task started and completed; capture Celery task id and any stack traces (PASS Task Execution)
   - Confirm route row in Postgres `route_plans` (PASS Route Persistence)

If you want, I can now make the non-destructive config change and re-run the full validation (restart uvicorn with the corrected env), or I can wait for you to approve the change. Which do you prefer?
