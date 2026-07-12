# End To End Validation Report

## Prediction Layer
PASS

## Agent Layer
PASS

## Route Optimization
PASS

## Event Pipeline
PASS

## Overall Workflow
PASS

## Executed Workflow
1. Create Order
2. GPS Update
3. Feature Engineering
4. Prediction
5. Risk Scoring
6. Agent Decision
7. Redis Publish
8. WebSocket Broadcast

## Latency
- Create Order: `124.94 ms`
- GPS Update: `12.94 ms`
- Prediction Endpoint: `62.87 ms`
- Direct Prediction: `32.59 ms`

## Payload Samples
- Create order input included `stops` with 2 stops and a future `plannedEta`.
- Prediction response sample:
	- `risk_score`: `0.05299019441008568`
	- `confidence`: `high`
	- `top_risk_factors[0].feature`: `time_elapsed_ratio`
- Event samples:
	- `prediction_updated`
	- `agent_updated`
	- `agent_decision`
	- `route_updated`

## Root Cause
The workflow initially failed at three boundaries: wrong prediction service invocation, naive/aware datetime comparison, and invalid feature / response shaping in the prediction router.

## Applied Fix
Patched the prediction router to use the correct inference API and SHAP output, patched the order router to use UTC-aware time comparison, and validated the full workflow with FakeRedis event fan-out.