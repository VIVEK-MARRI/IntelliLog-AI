# Event Pipeline Report

## Status
PASS

## Latency
- Prediction publish path: `sub-1 ms`
- Agent audit publish path: `sub-1 ms`
- Route publish path: `sub-1 ms`

## Payload Samples
- Prediction event:
  - `type`: `prediction_updated`
  - `order_id`: `sample-order-1`
  - `risk_score`: `0.05299019441008568`
- Agent event:
  - `type`: `agent_decision`
  - `order_id`: `sample-order-1`
  - `decision`: `reroute`
- Route event:
  - `type`: `route_updated`
  - `order_id`: `sample-order-1`
  - `new_waypoints`: 2 waypoints

## Root Cause
The event pipeline previously depended on Redis pub/sub wiring but could not be validated end to end until the prediction and order creation failures were removed.

## Applied Fix
Used `fakeredis.aioredis.FakeRedis`, published to `tenant:tenant-001:events`, and verified websocket fan-out through `broadcast_to_tenant()` and the websocket router's forwarding path.

## Websocket Delivery
- Captured event types delivered to the websocket send path:
  - `prediction_updated`
  - `agent_decision`
  - `route_updated`