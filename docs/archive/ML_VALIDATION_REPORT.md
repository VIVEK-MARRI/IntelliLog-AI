# ML Validation Report

## Passed Checks

- `models/model.joblib` exists.
- `models/feature_names.json` exists.
- `models/threshold.json` now exists as a compatibility alias.
- `PredictionService` loads successfully.
- Feature schema loads successfully and contains 14 ordered features.
- Sample inference runs successfully.
- Batch inference runs successfully.
- SHAP explanations generate successfully.
- Latency is measured successfully.

## Validation Results

### Model Load
- Model type: `XGBClassifier`
- Feature count: `14`
- Threshold: `0.5081632653061224`

### Sample Inference
- Order ID: `order-001`
- Risk score: `0.047000`
- High risk: `False`
- Confidence: `high`
- Inference latency: `14.335 ms`

### Batch Inference
- Batch size: `3`
- `order-batch-1`: risk score `0.047000`, high risk `False`, latency `0.768 ms`
- `order-batch-2`: risk score `0.101807`, high risk `False`, latency `0.504 ms`
- `order-batch-3`: risk score `0.061357`, high risk `False`, latency `0.908 ms`

### SHAP Explanation
- SHAP explanations generated for `order-shap`.
- Top SHAP features:
  - `time_elapsed_ratio` -> `decreases_risk` (`2.225982`)
  - `pace_ratio` -> `decreases_risk` (`0.486796`)
  - `driver_on_time_rate` -> `decreases_risk` (`0.176760`)
  - `hour_of_day_sin` -> `decreases_risk` (`0.041962`)
  - `current_speed_kmh` -> `decreases_risk` (`0.040775`)

### Latency Benchmark
- Average latency over 25 predictions: `0.697 ms`
- P99 latency: `1.39 ms`
- Max latency: `1.39 ms`

## Warnings

- The repo originally shipped `optimal_threshold.json`; I added `models/threshold.json` as a compatibility alias so the expected artifact name is present.
- `PredictionService` printed Unicode checkmarks during startup, which caused a Windows console encoding failure during validation. I changed those startup logs to ASCII-safe messages in [src/ml/inference.py](src/ml/inference.py).

## Failures

- No ML pipeline failures remained after the startup log fix.

## Exact Fixes

- [models/threshold.json](models/threshold.json): added the expected threshold artifact as a compatibility alias.
- [src/ml/inference.py](src/ml/inference.py): replaced Unicode startup markers with ASCII-safe logs so model initialization works on the current Windows environment.

## Validation Command

- Python inference smoke test executed successfully through the workspace Python environment with sample inference, batch inference, SHAP generation, and latency benchmarking.
