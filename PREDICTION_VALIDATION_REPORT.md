# Prediction Validation Report

## Status
PASS

## Latency
- Direct model call latency: `32.59 ms`
- API latency: `62.87 ms`

## Payload Sample
- Input feature seed:
  - `order_id`: `sample-order-1`
  - `planned_stops`: `4`
  - `completed_stops`: `1`
  - `planned_duration_minutes`: `120`
  - `actual_duration_so_far_minutes`: `35`
  - `speed`: `41.0`
- API response sample:
  - `risk_score`: `0.05299019441008568`
  - `confidence`: `high`
  - `predicted_delay_minutes`: `0.0`
  - `top_risk_factors[0].feature`: `time_elapsed_ratio`

## Root Cause
The prediction route originally called the inference service with the wrong signature and later passed an underspecified feature dict.

## Applied Fix
The router now builds the live 14-feature vector with `FeatureBuilder.build_from_live(...)`, calls `PredictionService.predict_with_shap(order_id, features)`, and serializes SHAP factors into the API schema.