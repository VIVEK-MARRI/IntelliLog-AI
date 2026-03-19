"""
Continuous Learning Pipeline - Architecture & Operations Guide
===============================================================

## Overview

The continuous learning pipeline enables IntelliLog-AI to automatically improve its ETA prediction model
without manual intervention. Every completed delivery generates ground truth data that feeds into a
fully automated retraining, validation, and deployment workflow.

## Architecture

### 1. Feedback Collection Layer
**Module**: `feedback_collector.py`

Operates at delivery completion:
- Records delivery outcomes: predicted_eta_min, actual_delivery_min
- Computes error: error_min = actual - predicted (positive = late)
- Captures context: traffic_condition, weather, vehicle_type, distance_km, day_of_week
- Updates rolling metrics in Redis: mae_7day:{tenant_id}, accuracy_7day:{tenant_id}

**Trigger**: Async task `record_delivery_feedback_task` on DeliveryCompleted event
**Storage**: delivery_feedback table
**Metrics Updated**: 7-day rolling MAE, accuracy within 15 minutes

### 2. Data Drift Detection
**Module**: `drift_detector.py`

Runs daily at 6 AM UTC via Celery Beat:
- Fetches 7 days of delivery feedback
- Compares against training data distribution (KS test, p < 0.05)
- Tests 3 key features: distance_km, time_of_day, traffic_condition
- Computes MAE degradation vs production baseline
- Auto-triggers emergency retraining if high severity drift detected

**Trigger**: `detect_drift_task` (6 AM UTC daily)
**Output**: DriftEvent records with severity (low/medium/high)
**Action on High Severity**: Calls `emergency_retrain_task` immediately

### 3. Model Retraining
**Module**: `model_retrainer.py`

Runs nightly at 2 AM UTC via Celery Beat:
- Fetches 30 days of delivery feedback (configurable lookback)
- Data quality checks: schema validation, outlier detection (>60 min error), duplicates
- Aborts if: samples < 500 or quality_score < 0.80
- Trains XGBoost + calibrator on recent data
- Evaluates on 20% held-out test set
- Logs all to MLflow: params, metrics, artifacts, training distribution
- Promotes to staging if: new_mae < production_mae * 1.05 (5% threshold)
- Otherwise archives with failure reason logged

**Trigger**: `retrain_model_for_tenant_task` (2 AM UTC for all tenants)
**Emergency Path**: `emergency_retrain_task` (7-day lookback, triggered on high drift)
**Output**: ModelRegistry entries in 'staging' or 'archived' stage

### 4. A/B Testing & Model Promotion
**Module**: `model_promoter.py`

Two-stage promotion flow:

**Stage 1: A/B Test Initialization**
- Triggered by: successful retrain (staging model created)
- Splits production traffic 50/50 between current + new model
- Duration: 48 hours (configurable)
- Tracks which model served each prediction

**Stage 2: Promotion Decision**
- Runs every 6 hours (checks expired tests)
- Examines model_b_version vs model_a_version metrics
- Winner = model with lower MAE on real traffic
- If improvement > 2% threshold: promote; else archive
- Updates Redis: current_model:{tenant_id}
- Triggers Kubernetes rolling restart of prediction service pods

**Trigger**: Check runs every 6 hours via `check_staging_models_task`
**Output**: ModelRegistry promoted to 'production' stage after A/B test

### 5. Monitoring Metrics
**Module**: `metrics_collector.py`

Prometheus metrics scraped by Prometheus/Grafana:

| Metric | Labels | Meaning |
|--------|--------|---------|
| model_age_hours | tenant_id | Hours since last production deployment |
| prediction_mae_7day | tenant_id | Rolling 7-day Mean Absolute Error |
| drift_score | tenant_id, feature | KS statistic per feature |
| retraining_success_rate | tenant_id | % of retrains that improved model |
| model_performance_improvement | tenant_id | % improvement vs previous |
| retraining_duration_seconds | tenant_id | Duration histogram |
| retraining_samples | tenant_id | Count of samples used |
| data_quality_score | tenant_id | Quality (0-1) of latest retrain data |
| drift_events_total | tenant_id, severity | Count of drift events by severity |
| production_model_accuracy | tenant_id | Accuracy (% within 15 min) on recent data |

**Update Frequency**: Every 30 minutes via `update_metrics_task`

## Database Schema

### New Tables

**delivery_feedback** (extended)
```
- id: str (PK)
- tenant_id: str (FK) [indexed]
- order_id: str
- driver_id: str (FK) [nullable]
- prediction_model_version: str
- predicted_eta_min: float
- actual_delivery_min: float [nullable]
- error_min: float [nullable] — computed: actual - predicted
- traffic_condition: enum [nullable] — free_flow, moderate, congested, heavy
- weather: enum [nullable] — clear, rain, snow, fog
- vehicle_type: enum [nullable] — car, van, truck
- distance_km: float [nullable]
- time_of_day: enum [nullable] — morning, afternoon, evening, night
- day_of_week: int [nullable] — 0=Monday, 6=Sunday
- predicted_at: datetime [indexed]
- delivered_at: datetime [nullable]
- created_at: datetime [indexed]
```

**drift_events** (new)
```
- id: str (PK)
- tenant_id: str (FK) [indexed]
- timestamp: datetime (default now)
- feature_name: str — distance_km, time_of_day, traffic_condition
- ks_statistic: float — KS test D statistic
- p_value: float — statistical significance
- severity: enum — low, medium, high
- training_mean: float [nullable]
- recent_mean: float [nullable]
- description: str [nullable]
- created_at: datetime [indexed]
```

**model_registry** (new)
```
- id: str (PK)
- tenant_id: str (FK) [indexed]
- model_version: str [indexed] — v_20260319_120000
- stage: str — staging, production, archived
- mae_test: float
- mae_improvement_pct: float [nullable]
- rmse_test: float [nullable]
- r2_score: float [nullable]
- mlflow_run_id: str [nullable]
- training_start_time: datetime [nullable]
- training_end_time: datetime [nullable]
- deployment_time: datetime [nullable]
- is_production: bool [indexed]
- created_at: datetime [indexed]
```

**model_training_logs** (new)
```
- id: str (PK)
- tenant_id: str (FK) [indexed]
- run_id: str — Celery task ID or MLflow run ID
- started_at: datetime
- completed_at: datetime [nullable]
- status: str — running, success, failed, skipped
- model_version: str [nullable]
- num_training_samples: int [nullable]
- data_quality_score: float [nullable]
- failure_reason: str [nullable]
- error_log: str [nullable]
- mae_test: float [nullable]
- rmse_test: float [nullable]
- r2_score: float [nullable]
- created_at: datetime [indexed]
```

## Celery Tasks & Schedule

### Beat Schedule (Automatic)

| Task | Schedule | Purpose |
|------|----------|---------|
| retrain_models_task | 2:00 AM UTC daily | Retrain all tenant models |
| detect_drift_task | 6:00 AM UTC daily | Check for data drift |
| check_staging_models_task | Every 6 hours | Promote staging models if A/B test won |
| update_metrics_task | Every 30 minutes | Update Prometheus metrics |

### On-Demand Tasks

| Task | Trigger | Purpose |
|------|---------|---------|
| record_delivery_feedback_task | DeliveryCompleted event | Log delivery outcome |
| retrain_model_for_tenant_task | Manual or API | Retrain specific tenant |
| detect_drift_for_tenant_task | Manual or API | Check drift for tenant |
| emergency_retrain_task | High severity drift | Urgent retraining (7-day lookback) |
| start_ab_test_task | After successful retrain | Initiate A/B test |
| promote_model_task | Manual or A/B winner | Promote to production |

### Task Configuration

```python
# src/ml/continuous_learning/celery_tasks.py
app.conf.beat_schedule = {
    "retrain-models": {
        "task": "src.ml.continuous_learning.celery_tasks.retrain_models_task",
        "schedule": crontab(hour=2, minute=0),  # 2 AM UTC
    },
    # ... other tasks
}
```

## Data Quality Gates

### Retraining Thresholds

| Check | Threshold | Action |
|-------|-----------|--------|
| Minimum samples | 500 | Skip retraining if fewer |
| Data quality score | 0.80 | Abort if score < threshold |
| Missing values | 10% | Deduct from quality score |
| Outliers (>60min error) | 5% | Deduct from quality score |
| Invalid distance (0-200km) | 1% | Deduct from quality score |
| Invalid delivery time (1-480min) | 1% | Deduct from quality score |
| Duplicates | 5% | Deduct from quality score |

### Promotion Thresholds

| Decision | Threshold | Purpose |
|----------|-----------|---------|
| MAE degradation allowed | 5% | Model can be worse by 5% vs prod |
| A/B test improvement needed | 2% | Must beat prod by 2% to promote |
| KS test significance | p < 0.05 | Minimum statistical significance for drift |
| Drift severity | 15% MAE | Triggers emergency retrain if exceeded |

## Integration Points

### 1. Recording Feedback on Delivery Completion

```python
from src.ml.continuous_learning.celery_tasks import record_delivery_feedback_task

# In DeliveryCompleted event handler:
record_delivery_feedback_task.delay(
    order_id=order.id,
    tenant_id=order.tenant_id,
    predicted_eta_min=prediction.eta_min,
    actual_delivery_min=actual_minutes,
    prediction_model_version=used_model_version,
    driver_id=order.driver_id,
    traffic_condition="moderate",
    weather="clear",
    vehicle_type="car",
    distance_km=route_distance,
    time_of_day="afternoon",
    day_of_week=datetime.now().weekday(),
)
```

### 2. Fetching Current Production Model

```python
import redis
from src.backend.app.core.config import settings

redis_client = redis.from_url(settings.REDIS_RESULT_BACKEND_URL)

# Get current model version for tenant
model_version = redis_client.get(f"current_model:{tenant_id}")

# Check if in A/B test
staging_model = redis_client.get(f"ab_test:{tenant_id}:staging_model")
traffic_split = float(redis_client.get(f"ab_test:{tenant_id}:traffic_split") or "0")

if traffic_split > 0:
    # A/B test active: use staging_model with given probability
    import random
    if random.random() < traffic_split:
        model_version = staging_model
```

### 3. Monitoring & Alerting

```python
from prometheus_client import generate_latest

# Expose metrics endpoint
@app.get("/metrics")
def metrics():
    return generate_latest()

# In Prometheus config:
# scrape_configs:
#   - job_name: 'intellog-ml'
#     static_configs:
#       - targets: ['localhost:8000']
#     metrics_path: '/metrics'
```

## Configuration

Environment variables in `.env`:

```bash
# Retraining
AUTO_RETRAIN_ENABLED=true
RETRAIN_SCHEDULE_CRON="0 2 * * *"  # 2 AM UTC daily

# Drift detection
DRIFT_DETECTION_ENABLED=true
DRIFT_SCORE_THRESHOLD=0.3
DRIFT_CHECK_INTERVAL_HOURS=24

# A/B testing
AB_TEST_ENABLED=true
AB_SHADOW_EVAL_CRON="15 */6 * * *"
AB_PROMOTION_CRON="30 */6 * * *"

# MLflow
MLFLOW_TRACKING_URI="file:./mlruns"
MLFLOW_EXPERIMENT_NAME="intellog-eta-production"

# Celery
CELERY_BROKER_URL="redis://localhost:6379/0"
CELERY_RESULT_BACKEND="redis://localhost:6379/1"  
CELERY_TIMEZONE="UTC"
```

## Troubleshooting

### Retraining Keeps Failing

1. Check data quality: `ModelTrainingLog.data_quality_score`
2. Verify minimum samples: Check `delivery_feedback` row count for past 30 days
3. Inspect error log: `ModelTrainingLog.error_log`
4. Debug data issues: Run quality checks manually

### Model Stuck in Staging

1. Check A/B test status: `ABTest.status`, `ends_at`
2. Verify metrics comparison logic in `_compute_ab_test_metrics`
3. Check if production model exists: `ModelRegistry WHERE stage='production'`

### Metrics Not Updating

1. Verify Celery Beat is running: `celery -A src.ml.continuous_learning.celery_tasks beat`
2. Check task logs: `ModelTrainingLog`, `DriftEvent` counts
3. Ensure Redis is available for lock/scheduling

### High Drift Detected

1. Review `DriftEvent` records: feature_name, KS statistic, severity
2. Compare `training_mean` vs `recent_mean`
3. Check if emergency retrain was triggered
4. Investigate data collection: potential sensor/system changes

## Testing

Run comprehensive pytest suite:

```bash
pytest tests/test_continuous_learning.py -v

# Run specific test class
pytest tests/test_continuous_learning.py::TestFeedbackCollector -v

# Run with coverage
pytest tests/test_continuous_learning.py --cov=src.ml.continuous_learning
```

## Performance Notes

- **Retraining Duration**: 5-15 minutes for 10K samples (XGBoost)
- **Drift Detection**: 30-60 seconds for 1000 feedback records
- **Metrics Updates**: <5 seconds for all metrics
- **A/B Test Duration**: 48 hours (default)
- **Redis Storage**: ~1 KB per 30-day feedback window per tenant

## Future Enhancements

1. **Hyperparameter Tuning**: Automated grid search via Optuna
2. **Feature Engineering**: Auto-generate derived features from delivery context
3. **Multi-Model Ensembles**: Stack multiple architectures (XGBoost, LightGBM, NNs)
4. **Federated Learning**: Train global model from multi-tenant data without data sharing
5. **Online Learning**: Incremental model updates (Vowpal Wabbit, River)
6. **Causal Inference**: Understand which factors truly impact ETA (DoWhy)
7. **Bias Monitoring**: Alert on accuracy gaps across driver segments
"""
