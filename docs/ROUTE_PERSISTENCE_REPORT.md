# Route Persistence Validation Report

Scope
- Verify that optimization jobs persist route plans to the `route_plans` table, can be retrieved via API, and are consumable by the frontend.

What I inspected
- Celery task: `src/optimization/tasks.py` (task `solve_routing_job`).
- Route retrieval endpoints: `src/api/routers/routes.py` (`/routes/{order_id}/current`, `/routes/{order_id}/history`, `/routes/jobs/{job_id}`).
- Optimization service interfaces used by the router and task.

Findings
- Persistence: `solve_routing_job` inserts a row into `route_plans` with `waypoints` (JSON), `total_distance_km`, `total_duration_minutes`, `solver_status`, and timestamp via `INSERT INTO route_plans ...` using `gen_random_uuid()`; commit follows. This is correct for persistence.
- Job status: Task updates Redis keys during execution and writes a completed `result` field to the job hash, then publishes `route_updated` event on pub/sub channels.
- Retrieval: `/routes/{order_id}/current` reads the latest `route_plans` row and converts `waypoints` into `RouteResponse` via `_waypoints_from_stops`—the API returns real persisted data.
- History: `/routes/{order_id}/history` returns recent `route_plans` rows (LIMIT 20) as JSON objects for UI consumption.

Actions taken
- Reviewed task logic and router queries; no structural changes required.
- Re-ran API tests to confirm route retrieval endpoints still pass (all API tests passed).

Validation status
- Persistence confirmed in code; to fully validate at runtime, a worker must run and execute `solve_routing_job` against a running Postgres instance with write access.
- Retrieval via API: Verified by code review and existing test coverage for router behavior.

Recommendation
- For full end-to-end verification, start a Celery worker connected to the same DB and Redis, submit an optimization job via `/routes/optimize` with a seeded `order` and `stops` present in Redis, and confirm that:
  - `route_plans` row appears in Postgres
  - `/routes/{order_id}/current` returns the persisted plan
  - Frontend displays the plan in the route viewer


--
Generated as part of Sprint 2 validation.
