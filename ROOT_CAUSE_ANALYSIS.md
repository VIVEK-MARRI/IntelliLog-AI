# Root Cause Analysis

## Status
PASS

## Primary Failure Points

### 1) `src/api/routers/predictions.py`
- Function: `get_prediction()`
- Stack trace:
  - `TypeError: PredictionService.predict() missing 1 required positional argument: 'features'`
- Root cause: The router called `prediction_service.predict(features)` even though `PredictionService.predict()` requires `(order_id, features)`.
- Applied fix: Switched the router to `prediction_service.predict_with_shap(order_id, features)` and consumed the `PredictionResult` dataclass fields directly.

### 2) `src/api/routers/orders.py`
- Function: `create_order()`
- Stack trace:
  - `TypeError: can't compare offset-naive and offset-aware datetimes`
- Root cause: The router compared an aware `plannedEta` payload against naive `datetime.utcnow()`.
- Applied fix: Replaced the comparison with `datetime.now(timezone.utc)`.

### 3) `src/api/routers/predictions.py`
- Function: `get_prediction()`
- Stack trace:
  - `ValueError: Invalid features for order sample-order-1: Missing feature: stops_remaining_ratio`
  - `1 validation error for RiskFactor ... human_readable Field required`
- Root cause: The endpoint passed an underspecified feature dict instead of a full 14-feature live vector, and then built `RiskFactor` objects without the required human-readable text.
- Applied fix: Reused `prediction_service.feature_builder.build_from_live(...)` and mapped SHAP factors into `RiskFactor` with `humanReadable` populated.

## Final Outcome
The end-to-end workflow completed successfully with FakeRedis after the above fixes were applied.