# Frontend Integration Report

Summary
-------
- Connected dashboard widgets to real backend API surface and WebSocket subscriptions.
- Removed local UI mocks from intelligence widgets.
- Added a backend `copilot` API client and wired Operations Copilot to call it (with local fallback).

Files changed / added
--------------------
- Updated: frontend/src/components/intelligence/UsageAnalytics.tsx — removed hard-coded widget data and derive usage from real metrics.
- Updated: frontend/src/components/intelligence/DashboardIntelligence.tsx — operator metrics derived from `useDashboardMetrics` instead of mocks.
- Updated: frontend/src/components/copilot/OperationsCopilot.tsx — now calls backend via `copilotAPI.query` and falls back if unavailable.
- Added: frontend/src/api/copilot.ts — `copilotAPI.query(query, context)` posts to `/copilot/query`.

Connected widgets
-----------------
- FleetMap: consumes `fleetStore` orders (populated by initial HTTP load in `Dashboard` and live updates via `wsManager`).
- OrderTable: reads orders from `fleetStore` (sorted, real-time updates apply).
- DecisionLog: reads `agentDecisions` from `fleetStore`, updated by WebSocket agent_decision messages.
- RiskExplainer: uses `predictionsAPI.getPrediction(orderId)` (unchanged) for SHAP explanations.
- FleetHealth: populated from `predictionsAPI.getFleetHealth()` on dashboard load.
- OperationsInsights: receives `metrics`, `recommendations`, and `delayCauses` from `useDashboardMetrics`.
- OperationsCopilot: now calls backend copilot endpoint for natural-language queries.

Real-time behavior
------------------
- WebSocket manager (`wsManager`) is instantiated in `Dashboard` and connects using tenant and token from `authStore`.
- WebSocket messages handled and routed in `frontend/src/api/websocket.ts` update `fleetStore`:
  - `order_position_updated` -> `updateOrderPosition`
  - `prediction_updated` -> `updateOrderRisk`
  - `agent_decision` -> `addAgentDecision`
  - `route_updated` -> `updateRouteWaypoints`
  - `eta_updated` -> `updateOrderETA`
- Dashboard initial data load still comes from REST endpoints on mount (orders, metrics, fleet-health, recommendations).
- If backend is unavailable, operations will fall back gracefully (Copilot uses local fallback; other APIs will throw and show errors handled by components).

Validation steps (recommended)
------------------------------
1. Start backend services (Postgres, Redis, API) — Docker compose or local services.

    ```powershell
    docker compose -f docker-compose.dev.yml up -d postgres redis api
    # or start services individually
    ```

2. Run migrations and start the API:

    ```powershell
    alembic upgrade head
    python -m uvicorn src.api.main:app --reload
    ```

3. Start the frontend dev server:

    ```powershell
    cd frontend
    npm install
    npm run dev
    ```

4. Open the dashboard at `http://localhost:5173` and log in. Dashboard will load initial orders and metrics.

5. Verify WebSocket live updates:
   - Publish test events to Redis channel `tenant:{tenant_id}:events` (or use backend agent to emit events).
   - Confirm `OrderTable` and `FleetMap` update positions and risk changes in real-time.
   - Confirm agent decisions appear in `DecisionLog`.

6. Test Copilot:
   - Open Operations Copilot, ask a question (e.g., "Why are deliveries delayed today?").
   - Verify the request hits backend `/copilot/query` (or falls back to local response if backend is unavailable).

Notes & Next Steps
------------------
- For full E2E validation, ensure Redis and Postgres are accessible; local TestClient harnesses can simulate events but do not replace real backend latency/scale tests.
- Consider adding a dedicated telemetry endpoint for widget usage to fully remove derived fallbacks in `UsageAnalytics`.
- If the backend exposes streaming Copilot (SSE/WebSocket), update `copilotAPI` and `OperationsCopilot` to stream partial responses.

Contact
-------
If you want, I can: (a) run the E2E checks against your running backend, (b) wire Copilot streaming, or (c) add an optional `telemetryAPI.getWidgetUsage()` endpoint and hook it up.
