# IntelliLog-AI Frontend — Validation Infrastructure

This directory contains the runtime validation harness for IntelliLog-AI. It replaces assumptions with executable proof.

## Layout

```
tests/
  e2e/                    Playwright browser-driven tests
    login.spec.ts         A.1-A.3
    dashboard.spec.ts     B.1-B.3 (progressive loading, no blank screen)
    fleet-map.spec.ts     C.1-C.3 (mount, pan/zoom, markers)
    vehicle-panel.spec.ts D.1-D.3
    route-optimization.spec.ts E.1-E.3
    copilot.spec.ts       F.1-F.3
    auth-cycle.spec.ts    G.1-G.3 (logout/login, no stale state)
    fleet-validation.spec.ts H.1-H.3 (seeded counts)
    websocket.spec.ts     I.1-I.3
  load/
    dashboard.js          k6 load test
  unit/
    validation.test.mjs    Zod schema tests (Node test runner)
  fixtures/
    auth.ts               Login/logout helpers
  helpers/
    console.ts            Console error capture + noise filter
    network.ts            Network failure capture
scripts/
  smoke-checks.mjs        API/WS/Copilot health probes (no browser)
  demo-validate.mjs       Orchestrator → report
playwright.config.ts      Playwright config (boots dev server)
```

## One-command validation

```bash
npm run demo:validate
```

Runs smoke checks + Playwright E2E + (optionally) k6, then writes:

- `reports/demo-readiness.json` — machine-readable
- `reports/demo-readiness.md` — human report
- `reports/demo-readiness.html` — styled report (open in browser)
- `reports/playwright-results.json` — Playwright JSON
- `reports/playwright-html/` — Playwright HTML report

Exit codes:

| Code | Meaning |
|------|---------|
| 0    | All checks passed |
| 1    | Critical defects present |
| 2    | Non-critical failures |

### CLI flags

Works cross-platform (no Unix-only `VAR=val` syntax required):

```bash
node scripts/demo-validate.mjs --no-e2e --no-load
node scripts/demo-validate.mjs --profile=medium
node scripts/demo-validate.mjs --skip-smoke --no-report
node scripts/demo-validate.mjs --help
```

| Flag | Effect |
|------|--------|
| `--skip-playwright`, `--no-e2e`, `--skip-e2e` | Skip Playwright |
| `--skip-k6`, `--no-load`, `--skip-load` | Skip k6 |
| `--skip-smoke` | Skip API/WS/Copilot probes |
| `--no-report` | Don't write report files |
| `--profile <small\|medium\|large>` | Load test profile |
| `--help`, `-h` | Show help |

Env vars `SKIP_PLAYWRIGHT=1`, `SKIP_K6=1`, `SKIP_SMOKE=1`, `LOAD_PROFILE=medium` are still supported.

## Targeted runs

```bash
npm run smoke                    # API/WS/Copilot health only
npm run test:unit                # Zod schema tests (no browser)
npm run test:e2e                 # Playwright only
npm run test:load                # k6 small profile
LOAD_PROFILE=medium npm run test:load
LOAD_PROFILE=large npm run test:load
```

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `VITE_API_URL` | `http://localhost:8000` | Backend HTTP base |
| `VITE_WS_URL`  | `ws://localhost:8000/ws` | WebSocket URL |
| `E2E_EMAIL`    | `qa@intellilog.ai` | Test user |
| `E2E_PASSWORD` | `TestPassword!23` | Test user password |
| `PLAYWRIGHT_NO_SERVER` | unset | Skip auto-start of dev server |
| `PLAYWRIGHT_BASE_URL`   | `http://localhost:5173` | Frontend URL |
| `SKIP_PLAYWRIGHT`       | unset | Skip Playwright in demo:validate |
| `SKIP_K6`               | unset | Skip k6 in demo:validate |
| `LOAD_PROFILE`          | `small` | `small` / `medium` / `large` |
| `SMOKE_TIMEOUT_MS`      | `8000` | Per-check timeout |

## What the tests assert

### Playwright (browser)

Every spec captures console errors and failed network requests via `tests/helpers/`. Noise from Leaflet tile fetches and the favicon is filtered.

Each spec asserts:
- No `console.error` events that aren't filtered noise
- No failed network requests (4xx/5xx ignored only when intentional)
- Expected DOM state
- No uncaught exceptions

### Smoke checks (no browser)

| Check | Verifies |
|-------|----------|
| `api.health` | `GET /api/v1/health` returns < 500 |
| `ws.health` | `WebSocket` opens within 8s |
| `copilot.health` | `POST /api/v1/copilot/query` returns 200 or 503 (degraded) |

### k6 (load)

`tests/load/dashboard.js` measures:

- `http_req_duration` p99 < 1000ms
- `http_req_failed` < 1%
- `ws_session_duration` p95 < 30s
- `optimize_latency_ms` (custom Trend)
- `api_duration_ms` (custom Trend)
- `api_failed` (custom Rate)
- `ws_msgs_received` (custom Counter)

Profiles:
- `small`: 10 VUs, 30s, 50 orders / 15 drivers expected
- `medium`: 25 VUs, 1m, 100 / 30
- `large`: 50 VUs, 2m, 500 / 100

### Unit tests (Node test runner)

`tests/unit/validation.test.mjs` mirrors `src/utils/validation.ts` schemas and asserts:

- Well-formed `LiveOrder` arrays are accepted
- Missing required fields are rejected
- Wrong type for `risk_score` is rejected
- Invalid `status` enum value is rejected
- `OperationalMetrics` rejects string for `on_time_percentage`
- `FleetHealth` rejects unknown `status` value

## Pre-flight checklist

Before running `npm run demo:validate`:

- [ ] Backend running at `$VITE_API_URL`
- [ ] Postgres + Redis healthy
- [ ] Seed script applied: `python scripts/seed.py --warehouses 3 --drivers 15 --orders 50`
- [ ] Test user exists: `qa@intellilog.ai` with password from `.env`
- [ ] Frontend deps installed: `npm ci`
- [ ] Playwright browser installed: `npx playwright install chromium`
- [ ] k6 installed (for load profile): https://k6.io/docs/getting-started/installation/

## Reading the report

`reports/demo-readiness.md` shows:

- Total score (0–100)
- Classification (Not Ready / Portfolio / Hackathon / Demo / Production Candidate)
- Per-check pass/fail
- Critical defects with severity
- Reproduction steps

The classification is mechanical:
- ≥90 + 0 critical → Production Candidate
- ≥75 + 0 critical → Demo
- ≥60 + 0 critical → Hackathon
- ≥40 → Portfolio
- else → Not Ready

## Continuous Integration

`.github/workflows/frontend-validate.yml` runs on every push and PR that touches `frontend/`:

| Job | Trigger | What it does |
|-----|---------|--------------|
| `build` | push, PR | `npm ci` → `type-check` → `build` → `test:unit` |
| `e2e` | workflow_dispatch with `run_e2e: true` | `playwright test` with secrets for live backend |
| `full` | workflow_dispatch | `npm run demo:validate` + uploads report + comments on PR |

The `build` job is the always-on gate (fast, no backend needed).
The `e2e` and `full` jobs are manual (`Actions → frontend-validate → Run workflow → enable E2E/load`) and require these secrets to be set in the repo:

- `E2E_API_URL`, `E2E_WS_URL`, `E2E_FRONTEND_URL`
- `E2E_EMAIL`, `E2E_PASSWORD`

The full validation, when run on a PR, posts a comment with the score and any critical defects.
