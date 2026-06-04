# Agent Validation Report

## Result
PASS

## Validation
- Scenario: single shipment with order creation, GPS ping, prediction, risk evaluation, and reroute decision.
- Output:
  - `create_order`: `200`
  - `gps_ping`: `200`
  - `prediction_endpoint`: `200`
  - `agent_decision_audit`: completed successfully
- Latency:
  - `create_order`: `124.94 ms`
  - `gps_ping`: `12.94 ms`
  - `prediction_endpoint`: `62.87 ms`

## Notes
- The agent audit log published `agent_updated` and `agent_decision` events to the tenant event channel.
- The returned risk score was low, so the reroute decision remained a valid state transition rather than raising an exception.# Agent Validation Report

## Passed Checks

- `state.py` loads and persists `OrderAgentState` correctly.
- `graph.py` compiles as a LangGraph state machine.
- `tools.py` executes route optimization, notification, ETA update, and audit logging helpers.
- `runner.py` imports cleanly and the event loop wiring is intact.
- Sample shipment event was processed end to end.
- Feature extraction completed successfully.
- Prediction completed successfully.
- Risk assessment completed successfully.
- Decision generation completed successfully.
- Route recommendation completed successfully.
- Redis event publication completed successfully.

## Sample Shipment Event

- `order_id`: `shipment-001`
- `driver_id`: `driver-009`
- `tenant_id`: `tenant-001`
- `speed_kmh`: `15.0`
- `planned_stops`: `12`
- `completed_stops`: `0`
- `planned_duration_minutes`: `360.0`
- `actual_duration_so_far_minutes`: `360.0`
- `driver_on_time_rate`: `0.10`

## Validation Results

### Feature Extraction
- Produced 14 model features.
- Feature keys included:
  - `stops_remaining_ratio`
  - `time_elapsed_ratio`
  - `pace_ratio`
  - `avg_stop_dwell_minutes`
  - `current_speed_kmh`
  - `speed_ratio`
  - `route_deviation_meters`
  - `speed_trend`
  - `driver_on_time_rate`
  - `hour_of_day_sin`
  - `hour_of_day_cos`
  - `is_peak_hour`
  # Agent Validation Report

  ## Status
  PASS

  ## Latency
  - Order creation: `124.94 ms`
  - GPS update: `12.94 ms`
  - Prediction endpoint: `62.87 ms`

  ## Payload Sample
  - Order payload:
    - `orderId`: `sample-order-1`
    - `driverId`: `driver-1`
    - `plannedEta`: future UTC timestamp
    - `stops`: 2 delivery stops
  - Prediction payload sample:
    - `risk_score`: `0.05299019441008568`
    - `confidence`: `high`
    - `top_risk_factors[0].feature`: `time_elapsed_ratio`
  - Agent output sample:
    - `decision`: `reroute`
    - `audit_id`: `audit:sample-order-1:1780129406.347372`

  ## Root Cause
  The agent workflow depended on the same broken prediction and datetime paths as the API workflow, so it could not complete until those boundaries were fixed.

  ## Applied Fix
  After the router and datetime fixes, the agent audit path completed and published `agent_updated` and `agent_decision` events successfully.
- Published `agent_updates`
