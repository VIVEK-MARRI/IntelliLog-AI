"""
Continuous Learning Pipeline - Quick Start & Integration Guide
==============================================================

## Quick Start (5 Minutes)

### 1. Apply Database Migration

```bash
cd /path/to/IntelliLog-AI

# Apply migration to create new tables
alembic upgrade head

# Verify tables created
psql -U postgres -d intellog -c "
  SELECT table_name FROM information_schema.tables 
  WHERE table_schema = 'public' AND table_name IN ('drift_events', 'model_registry', 'model_training_logs');
"
```

### 2. Start Celery Worker & Beat

**Terminal 1: Celery Worker**
```bash
celery -A src.ml.continuous_learning.celery_tasks worker \
  --loglevel=info \
  --concurrency=2
```

**Terminal 2: Celery Beat (Scheduler)**
```bash
celery -A src.ml.continuous_learning.celery_tasks beat \
  --loglevel=info
```

### 3. Verify Redis Connectivity

```python
import redis
from src.backend.app.core.config import settings

redis_client = redis.from_url(settings.REDIS_RESULT_BACKEND_URL)
redis_client.ping()  # Should return True
```

### 4. Start Prometheus (Optional but Recommended)

```bash
# Download prometheus: https://prometheus.io/download/

# Create prometheus.yml:
cat > prometheus.yml << 'EOF'
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'intellog-ml'
    static_configs:
      - targets: ['localhost:8000']
    metrics_path: '/metrics'
EOF

# Run Prometheus
./prometheus --config.file=prometheus.yml
```

## Integration Points in Your Application

### 1. Record Feedback on Delivery Completion

Add this to your delivery completion handler (e.g., order status update):

**File**: `src/backend/app/api/api_v1/endpoints/orders.py`

```python
from src.ml.continuous_learning.celery_tasks import record_delivery_feedback_task
from datetime import datetime

@router.patch("/{order_id}/deliver")
async def complete_delivery(
    order_id: str,
    tenant_id: str,
    actual_delivery_minutes: float,
    current_user: AuthenticatedPrincipal = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark order as delivered and record feedback for ML pipeline."""
    
    order = db.query(Order).filter_by(id=order_id, tenant_id=tenant_id).first()
    if not order:
        raise HTTPException(status_code=404)
    
    # Get prediction that was made
    prediction = db.query(DeliveryLog).filter_by(order_id=order_id).order_by(
        DeliveryLog.predicted_at.desc()
    ).first()
    
    if prediction:
        # Record feedback asynchronously
        record_delivery_feedback_task.delay(
            order_id=order_id,
            tenant_id=tenant_id,
            predicted_eta_min=prediction.predicted_eta_min,
            actual_delivery_min=actual_delivery_minutes,
            prediction_model_version=prediction.model_version or "unknown",
            driver_id=order.driver_id,
            traffic_condition=getattr(order, "traffic_condition", None),
            weather=getattr(order, "weather", None),
            vehicle_type=getattr(order, "vehicle_type", None),
            distance_km=prediction.distance_km,
            time_of_day=_get_time_of_day(datetime.utcnow()),
            day_of_week=datetime.utcnow().weekday(),
        )
    
    # ... rest of delivery completion logic
    return {"status": "delivered"}

def _get_time_of_day(dt: datetime) -> str:
    """Get time of day from datetime."""
    hour = dt.hour
    if 6 <= hour < 12:
        return "morning"
    elif 12 <= hour < 17:
        return "afternoon"
    elif 17 <= hour < 21:
        return "evening"
    else:
        return "night"
```

### 2. Fetch Current Production Model

Update your ETA service to use dynamically selected model:

**File**: `src/backend/app/services/eta_service.py`

```python
import redis
from src.backend.app.core.config import settings

class ETAService:
    """Predict ETA with continuous learning model selection."""
    
    def __init__(self):
        try:
            self.redis_client = redis.from_url(settings.REDIS_RESULT_BACKEND_URL)
            self.redis_client.ping()
            self._has_redis = True
        except:
            self._has_redis = False
    
    def predict_eta(
        self,
        tenant_id: str,
        distance_km: float,
        origin_lat: float,
        origin_lng: float,
        destination_lat: float,
        destination_lng: float,
        **features
    ) -> dict:
        """Predict ETA and return both production and staging (if A/B test active)."""
        
        # Select which model(s) to use
        model_version = self._select_model_version(tenant_id)
        staging_model_version = self._check_ab_test(tenant_id)
        
        # Prepare features
        feature_dict = self._prepare_features(distance_km, **features)
        
        # Make prediction with production model
        eta_min, confidence = self._predict_with_model(
            model_version, feature_dict
        )
        
        prediction_data = {
            "eta_minutes": eta_min,
            "confidence": confidence,
            "model_version": model_version,
            "response_time_ms": 0,  # Timing would be measured
        }
        
        # If in A/B test, also get prediction from staging
        if staging_model_version:
            staging_eta, staging_conf = self._predict_with_model(
                staging_model_version, feature_dict
            )
            prediction_data["ab_test"] = {
                "staging_model": staging_model_version,
                "staging_eta_minutes": staging_eta,
                "staging_confidence": staging_conf,
            }
        
        return prediction_data
    
    def _select_model_version(self, tenant_id: str) -> str:
        """Get current production model version."""
        if self._has_redis:
            model_version = self.redis_client.get(f"current_model:{tenant_id}")
            if model_version:
                return model_version.decode() if isinstance(model_version, bytes) else model_version
        
        # Fallback to database or default
        return "default_v_20260310_000000"
    
    def _check_ab_test(self, tenant_id: str) -> Optional[str]:
        """Check if tenant is in active A/B test."""
        if not self._has_redis:
            return None
        
        staging_model = self.redis_client.get(f"ab_test:{tenant_id}:staging_model")
        if staging_model:
            return staging_model.decode() if isinstance(staging_model, bytes) else staging_model
        
        return None
    
    def _predict_with_model(self, model_version: str, features: dict) -> tuple:
        """Load model and make prediction."""
        # Load model from disk, S3, or MLflow
        model = self._load_model(model_version)
        
        eta_min = model.predict(features)
        confidence = self._compute_confidence(model, features)
        
        return eta_min, confidence
    
    def _load_model(self, model_version: str):
        """Load model from storage."""
        import joblib
        path = f"models/{model_version}/model.pkl"
        return joblib.load(path)
    
    def _prepare_features(self, distance_km: float, **kwargs) -> dict:
        """Prepare features for model inference."""
        return {
            "distance_km": distance_km,
            "weight": kwargs.get("weight", 1.0),
            "time_of_day_encoded": self._encode_time_of_day(kwargs.get("time_of_day")),
            "day_of_week": kwargs.get("day_of_week", 0),
            "traffic_encoded": self._encode_traffic(kwargs.get("traffic_condition")),
        }
    
    def _encode_time_of_day(self, time_of_day: Optional[str]) -> int:
        mapping = {"morning": 0, "afternoon": 1, "evening": 2, "night": 3}
        return mapping.get(time_of_day, 1)
    
    def _encode_traffic(self, traffic: Optional[str]) -> int:
        mapping = {"free_flow": 0, "moderate": 1, "congested": 2, "heavy": 3}
        return mapping.get(traffic, 1)
    
    def _compute_confidence(self, model, features: dict) -> float:
        """Compute prediction confidence (0-1)."""
        # Use calibrated probability or prediction interval
        # This is simplified; real implementation would use model's calibrator
        return 0.8
```

### 3. Monitor Feedback Collection

Check metrics are being collected:

```python
from src.ml.continuous_learning.feedback_collector import FeedbackCollector
from src.backend.app.db.session import SessionLocal

db = SessionLocal()
collector = FeedbackCollector(db)

tenant_id = "your-tenant-id"
metrics = collector.get_7day_metrics(tenant_id)

print(f"7-Day MAE: {metrics['mae_7day']:.2f} minutes")
print(f"Accuracy (within 15min): {metrics['accuracy_7day']:.1f}%")
print(f"Samples: {metrics['sample_count']}")
```

### 4. Trigger Manual Retraining

For testing or when demand is high:

```python
from src.ml.continuous_learning.celery_tasks import retrain_model_for_tenant_task

# Queue retraining for a specific tenant
task = retrain_model_for_tenant_task.delay(
    tenant_id="your-tenant-id"
)

# Check status
print(f"Task ID: {task.id}")
print(f"Status: {task.status}")
print(f"Result: {task.result}")
```

### 5. Check Drift Status

Monitor data drift for a tenant:

```python
from src.ml.continuous_learning.drift_detector import DriftDetector
from src.backend.app.db.session import SessionLocal

db = SessionLocal()
detector = DriftDetector(db)

result = detector.detect_drift("your-tenant-id")

if result["drift_detected"]:
    print(f"⚠️  Drift detected! Severity: {result['severity']}")
    print(f"Features affected: {result['features_with_drift']}")
    print(f"MAE degradation: {result['mae_degradation_pct']:.1f}%")
else:
    print("✅ No drift detected")
```

### 6. View Model Promotion History

```python
from src.backend.app.db.models import ModelRegistry
from src.backend.app.db.session import SessionLocal

db = SessionLocal()
tenant_id = "your-tenant-id"

models = db.query(ModelRegistry).filter_by(
    tenant_id=tenant_id
).order_by(ModelRegistry.created_at.desc()).limit(10).all()

for model in models:
    print(
        f"{model.model_version} | Stage: {model.stage:12} | MAE: {model.mae_test:.2f} | "
        f"Deployed: {model.deployment_time}"
    )
```

## Testing the Pipeline

### Unit Tests

```bash
# Run all continuous learning tests
pytest tests/test_continuous_learning.py -v

# Run specific test
pytest tests/test_continuous_learning.py::TestFeedbackCollector::test_record_delivery_feedback -v

# With coverage
pytest tests/test_continuous_learning.py --cov=src.ml.continuous_learning --cov-report=html
```

### Integration Tests

```python
# tests/test_continuous_learning_integration.py

def test_end_to_end_feedback_to_promotion(test_db, test_tenant):
    \"\"\"Test complete pipeline from feedback to model promotion.\"\"\"
    
    # 1. Record feedback
    from src.ml.continuous_learning.feedback_collector import FeedbackCollector
    collector = FeedbackCollector(test_db)
    
    for i in range(600):
        collector.record_delivery_feedback(
            order_id=f"order-{i}",
            tenant_id=test_tenant,
            predicted_eta_min=30.0 + random.normal(0, 2),
            actual_delivery_min=32.0 + random.normal(0, 2),
            prediction_model_version="v_20260310_000000",
        )
    
    # 2. Detect drift
    from src.ml.continuous_learning.drift_detector import DriftDetector
    detector = DriftDetector(test_db)
    result = detector.detect_drift(test_tenant)
    assert "drift_detected" in result
    
    # 3. Retrain model
    from src.ml.continuous_learning.model_retrainer import ModelRetrainer
    retrainer = ModelRetrainer(test_db)
    result = retrainer.retrain_model(test_tenant)
    assert result["status"] in ["success", "failed", "skipped"]
    
    # 4. Check for promotion
    from src.ml.continuous_learning.model_promoter import ModelPromoter
    if result["status"] == "success":
        promoter = ModelPromoter(test_db)
        promoted = promoter.promote_model_to_production(
            test_tenant, result["model_version"]
        )
        assert promoted is not None
```

## Troubleshooting

### Celery Tasks Not Running

```bash
# Check Beat is running
ps aux | grep celery

# Check worker is running
celery -A src.ml.continuous_learning.celery_tasks inspect active

# Monitor Celery in real-time
celery -A src.ml.continuous_learning.celery_tasks events

# View task logs
celery -A src.ml.continuous_learning.celery_tasks inspect registered
```

### Retraining Failures

```python
from src.backend.app.db.models import ModelTrainingLog
from src.backend.app.db.session import SessionLocal

db = SessionLocal()

# Get latest failed runs
failed_runs = db.query(ModelTrainingLog).filter_by(
    status="failed"
).order_by(ModelTrainingLog.created_at.desc()).limit(10).all()

for run in failed_runs:
    print(f"Run: {run.run_id}")
    print(f"Failure: {run.failure_reason}")
    print(f"Error Log: {run.error_log}")
    print("---")
```

### Model Stuck in Staging

```python
from src.backend.app.db.models import ABTest, ModelRegistry
from src.backend.app.db.session import SessionLocal
from datetime import datetime

db = SessionLocal()

# Find stuck A/B tests
stuck_tests = db.query(ABTest).filter(
    ABTest.status == "running",
    ABTest.ends_at < datetime.utcnow(),
).all()

for test in stuck_tests:
    print(f"A/B Test {test.id}: ended {test.ends_at}, still running")
    
    # Manually end and determine winner
    from src.ml.continuous_learning.model_promoter import ModelPromoter
    promoter = ModelPromoter(db)
    promoter.check_staging_models_promotion(test.tenant_id)
```

## Production Deployment Checklist

- [ ] Database migration applied (`alembic upgrade head`)
- [ ] Redis connection verified and working
- [ ] Celery worker started (`celery worker`)
- [ ] Celery Beat scheduler started (`celery beat`)
- [ ] Prometheus metrics endpoint exposed at `/metrics`
- [ ] First manual retraining executed successfully
- [ ] Feedback collection integrated in delivery completion handler
- [ ] Model selection integrated in ETA service
- [ ] Alerts configured for drift events
- [ ] Grafana dashboard created for key metrics
- [ ] Runbooks created for common issues
- [ ] Team trained on monitoring & troubleshooting

## Next Steps

1. **Customize thresholds** in config for your use case
2. **Set up monitoring** alerts for high drift or failed retrains
3. **Plan capacity** for Celery workers based on tenant count
4. **Set up backups** for MLflow artifacts and model registry
5. **Document SLA** for model freshness (e.g., max 7 days old)
"""
