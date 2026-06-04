# Placeholder Audit Report

Scope
- Inspect `src/api/routers/drivers.py`, `src/api/routers/agent.py`, `src/api/routers/routes.py`, and `src/api/routers/insights.py` for hardcoded arrays, fake metrics, sample objects, or placeholder responses. Replace where appropriate.

Summary of findings

1. `src/api/routers/drivers.py`
- Mostly real SQL queries against `drivers`, `orders`, `gps_events`, and `predictions` tables.
- No hardcoded arrays or placeholder objects detected.

2. `src/api/routers/agent.py`
- Uses real DB queries from `agent_decisions` and parses stored JSON reasoning.
- Bug found: `get_decision_detail` endpoint did not declare `db=Depends(get_db)` and would reference undefined `db` at runtime. (Patched.)

3. `src/api/routers/routes.py`
- Uses `OptimizationService` and DB queries for route retrieval (`route_plans`). No placeholder content present.

4. `src/api/routers/insights.py`
- Returned `trend: 0.0` as a hardcoded placeholder.
- Replaced `trend` with a simple DB-derived delta comparing average delay in the last 24 hours vs the previous 24 hours. This uses the existing DB connection via the `AnalyticsService` instance.

Patches applied
- `src/api/routers/agent.py`: Added `db=Depends(get_db)` to `get_decision_detail` to fix runtime error and ensure DB-driven detail retrieval.
- `src/api/routers/insights.py`: Replaced hardcoded `trend` with a DB-derived delta (recent 24h avg delay minus previous 24h avg delay). Fallback to `0.0` on any query error.

Files inspected (no change)
- `drivers.py` — queries are DB-backed.
- `routes.py` — queries are DB-backed and ready for retrieval.

Notes
- Several repository files and reports still include earlier "sample" payloads and example reports under the project docs (these are documentation artifacts and not runtime placeholders). Those can remain as examples.


--
Generated as part of Sprint 3 placeholder audit.
