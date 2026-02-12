# MLOps & Deployment Guide

## Zero-Authentication Fast Development

We're skipping auth for now to focus on **core ML excellence**. This means:

1. **No login gates** — Direct API access with rate limiting
2. **Single-tenant during dev** — Use env var `TENANT_ID=dev`
3. **Add auth later** — When feature-complete (Week 4+)

---

## 1. Local Development (5-Minute Setup)

### One-Command Initialization

```bash
# Clone and setup (handles venv, deps, DB, models)
./scripts/dev_bootstrap.sh
```

**Script**: `scripts/dev_bootstrap.sh`

```bash
#!/bin/bash
set -e

echo "🚀 IntelliLog-AI Development Setup..."

# Python venv
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt  # pytest, black, etc

# Database setup
alembic upgrade head
python scripts/seed_db.py --sample-size 1000

# Download pre-trained models
python scripts/download_models.py

# Start services
echo "✅ Setup complete!"
echo ""
echo "Start services:"
echo "  Backend: uvicorn src.backend.app.main:app --reload --port 8000"
echo "  Frontend: cd src/frontend && npm run dev"
echo "  Worker:   celery -A src.backend.worker.celery_app worker --loglevel=info"
```

### Environment Variables (`.env`)

```bash
# Core
ENVIRONMENT=development
TENANT_ID=dev
DEBUG=true

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/intellog_ai_dev
REDIS_URL=redis://localhost:6379/0

# Secrets (dev-only, unsafe values)
SECRET_KEY=dev-key-do-not-use-in-production-12345
JWT_SECRET=jwt-dev-secret-unsafe

# ML
MODEL_ARTIFACT_PATH=./ml/models/registry/
FEATURE_STORE_TYPE=redis

# Feature flags
ENABLE_DRIFT_DETECTION=true
ENABLE_AB_TESTING=true
```

---

## 2. Continuous Integration (GitHub Actions)

**File**: `.github/workflows/ml_test.yml`

```yaml
name: ML Tests & Model Validation

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.10'
      
      # Unit Tests
      - name: Run ML unit tests
        run: |
          pip install -r requirements-dev.txt
          pytest tests/unit/ml/ -v --cov=src/ml
      
      # Data Quality Checks
      - name: Validate training data
        run: python scripts/ml_scripts/validate_data_quality.py
      
      # Model Training Dry Run
      - name: Test training pipeline
        run: |
          dvc repro ml/dvc.yaml --dry
      
      # Lint & Type Check
      - name: Lint & type check
        run: |
          black --check src/ml/
          mypy src/ml/ --ignore-missing-imports
      
      # Performance baseline
      - name: Check inference latency
        run: pytest tests/performance/test_inference_latency.py -v
      
      # Report
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage.xml
```

---

## 3. Model Training Pipeline (Weekly)

### Automated Retraining Workflow

**File**: `scripts/ml_scripts/weekly_retrain.py`

```python
import os
import logging
from datetime import datetime
import mlflow
import dvc.api
from src.ml.training.pipeline import TrainingPipeline
from src.ml.monitoring.drift_detection import DriftDetector

logger = logging.getLogger(__name__)

def main():
    """
    Weekly retraining pipeline:
    1. Fetch latest delivery feedback
    2. Run DVC training pipeline
    3. Evaluate new model
    4. Mark for A/B test if improvement detected
    5. Log to MLflow with full lineage
    """
    
    logger.info("🎯 Starting weekly model retraining...")
    
    # 1. Fetch data
    logger.info("📊 Fetching feedback data...")
    feedback_data = fetch_delivery_feedback(lookback_days=7)
    
    if len(feedback_data) < 100:
        logger.warning("⚠️ Insufficient data (<100 samples), skipping training")
        return
    
    # 2. Data validation
    logger.info("✅ Validating data quality...")
    validator = DataQualityValidator(schema=FEATURE_SCHEMA)
    quality_results = validator.validate(feedback_data)
    
    if quality_results['quality_score'] < 80:
        logger.error(f"❌ Data quality too low: {quality_results['quality_score']}")
        send_alert("training_failure", quality_results)
        return
    
    # 3. Run DVC pipeline (reproducible)
    logger.info("🔄 Running DVC training pipeline...")
    os.system("dvc repro ml/dvc.yaml")
    
    # 4. Load & evaluate new model
    logger.info("📈 Evaluating new model...")
    new_model = load_model("ml/models/registry/latest.pkl")
    prod_model = load_model("ml/models/registry/production.pkl")
    
    metrics_new = evaluate_on_test_set(new_model)
    metrics_prod = evaluate_on_test_set(prod_model)
    
    improvement = (metrics_prod['mae'] - metrics_new['mae']) / metrics_prod['mae']
    
    logger.info(f"📊 New MAE: {metrics_new['mae']:.3f} vs Prod: {metrics_prod['mae']:.3f}")
    logger.info(f"📈 Improvement: {improvement*100:.1f}%")
    
    # 5. Drift detection on new model
    logger.info("🔍 Checking for data drift...")
    drift_results = detect_drift(feedback_data)
    
    if drift_results['drift_detected']:
        logger.warning(f"⚠️ Drift detected: {drift_results['severity']}")
    
    # 6. Log to MLflow
    logger.info("📝 Logging to MLflow...")
    with mlflow.start_run(experiment_name="weekly_retraining"):
        mlflow.log_params({
            'feedback_samples': len(feedback_data),
            'lookback_days': 7
        })
        mlflow.log_metrics({
            'new_mae': metrics_new['mae'],
            'prod_mae': metrics_prod['mae'],
            'improvement': improvement,
            'drift_score': drift_results['score']
        })
        mlflow.sklearn.log_model(new_model, "candidate_model")
        mlflow.log_dict(quality_results, "data_quality.json")
        mlflow.log_dict(drift_results, "drift_analysis.json")
    
    # 7. Decision: promote or schedule A/B test
    if improvement > 0.05:  # > 5% improvement
        logger.info("✅ Scheduling A/B test for new model...")
        schedule_ab_test(new_model, duration_hours=48)
    else:
        logger.info("⏭️ No significant improvement, archiving model")
        archive_model("ml/models/registry/latest.pkl")
    
    logger.info("✅ Weekly retraining complete!")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
```

**Cron Job**:
```bash
# Weekly retraining (Sundays at 2 AM UTC)
0 2 * * 0 cd /app && python scripts/ml_scripts/weekly_retrain.py >> logs/retraining.log 2>&1
```

---

## 4. A/B Testing Framework

**File**: `src/ml/experiments/ab_testing.py`

```python
from typing import Dict, List
import numpy as np
from scipy import stats

class ABTestRunner:
    """
    Statistical A/B testing for model promotions.
    
    Ensures decisions are backed by 95% confidence (p < 0.05).
    """
    
    def __init__(
        self,
        baseline_model,
        candidate_model,
        test_duration_hours: int = 48,
        traffic_split: float = 0.5
    ):
        self.baseline = baseline_model
        self.candidate = candidate_model
        self.duration = test_duration_hours
        self.split = traffic_split
        self.results = []
    
    def run_test(self) -> Dict[str, any]:
        """
        Route requests to models and collect results.
        """
        test_id = f"ab_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        logger.info(f"🧪 Starting A/B test {test_id}")
        logger.info(f"   Baseline: {self.baseline.version}")
        logger.info(f"   Candidate: {self.candidate.version}")
        logger.info(f"   Split: {self.split*100:.0f}% / {(1-self.split)*100:.0f}%")
        logger.info(f"   Duration: {self.duration}h")
        
        # Test runs in background, collecting metrics
        # After duration, analyze results
        time.sleep(self.duration * 3600)
        
        # Compare
        analysis = self._analyze_results()
        
        return {
            "test_id": test_id,
            "analysis": analysis,
            "recommendation": self._recommend_action(analysis)
        }
    
    def _analyze_results(self) -> Dict:
        """Statistical significance testing."""
        
        baseline_errors = self.results['baseline_errors']
        candidate_errors = self.results['candidate_errors']
        
        # Two-sample t-test
        t_stat, p_value = stats.ttest_ind(baseline_errors, candidate_errors)
        
        baseline_mae = np.mean(baseline_errors)
        candidate_mae = np.mean(candidate_errors)
        
        return {
            'baseline_mae': float(baseline_mae),
            'candidate_mae': float(candidate_mae),
            't_statistic': float(t_stat),
            'p_value': float(p_value),
            'is_significant': p_value < 0.05,
            'effect_size': (baseline_mae - candidate_mae) / baseline_mae,
            'samples': len(baseline_errors)
        }
    
    def _recommend_action(self, analysis: Dict) -> str:
        """Recommend promotion or rollback."""
        
        if not analysis['is_significant']:
            return "continue_testing"  # Extend test
        
        if analysis['candidate_mae'] < analysis['baseline_mae']:
            return "promote_to_production"
        else:
            return "archive_candidate"
```

---

## 5. Monitoring & Alerting

### Grafana Dashboard

```bash
# Start Prometheus + Grafana
docker-compose -f monitoring/docker-compose.yml up -d

# Access Grafana at http://localhost:3000 (admin/admin)
```

### Alert Rules

**File**: `monitoring/alerts/ml_alerts.yml`

```yaml
groups:
  - name: ml_system
    rules:
      - alert: PredictionLatencyHigh
        expr: histogram_quantile(0.99, prediction_latency_ms) > 100
        for: 5m
        annotations:
          summary: "P99 prediction latency > 100ms"
          severity: "warning"
      
      - alert: ModelAccuracyDrop
        expr: prediction_accuracy_percent < 90
        for: 1h
        annotations:
          summary: "Model accuracy dropped below 90%"
          severity: "critical"
      
      - alert: DataDriftDetected
        expr: model_drift_score > 0.3
        for: 10m
        annotations:
          summary: "Data drift detected, retraining triggered"
          severity: "high"
```

---

## 6. Deployment Stages

### Stage 1: Local Development (Week 1)
```bash
./scripts/dev_bootstrap.sh
# Start services manually
```

### Stage 2: Docker Compose (Week 2)
```bash
docker-compose -f docker-compose.yml up --build
# All services orchestrated locally
```

### Stage 3: Staging (Cloud) (Week 3)
```bash
# Push to container registry
docker build -t ghcr.io/vivek/intellog-api:latest -f docker/Dockerfile.api .
docker push ghcr.io/vivek/intellog-api:latest

# Deploy to staging cluster
kubectl apply -f k8s/staging/
```

### Stage 4: Production (Week 4+)
```bash
# Blue-green deployment
kubectl apply -f k8s/production/

# Monitor rollout
kubectl rollout status deployment/intellog-api -w
```

---

## 7. Runbooks (Operational Playbooks)

### Model Degradation Runbook

```markdown
## 🚨 Alert: Model Accuracy < 90%

**Severity**: Critical

### Diagnosis (5 min)
1. Check Grafana dashboard → "Model Accuracy" panel
2. Determine if accuracy drop is gradual or sudden
3. Check data quality metrics

### Immediate Actions (10 min)
1. Check for data drift:
   ```bash
   python scripts/ml_scripts/check_drift.py
   ```
2. If no drift, check recent feedback data:
   ```bash
   psql -c "SELECT COUNT(*), AVG(ABS(error)) FROM delivery_feedback WHERE completed_at > NOW() - INTERVAL '1 day'"
   ```

### Recovery Options
1. **Rollback old model** (2 min):
   ```bash
   kubectl set image deployment/api api=ghcr.io/vivek/intellog-api:v_20260207_150000
   ```

2. **Trigger urgent retraining** (30 min):
   ```bash
   python scripts/ml_scripts/emergency_retrain.py
   ```

3. **Manual review** (open incident):
   - Page ML Engineer on-call
   - Review recent data changes
   - Check for distributional anomalies
```

---

## 8. Success Metrics Dashboard

Track these KPIs weekly:

| KPI | Week 1 | Week 2 | Week 3 | Week 4+ |
|-----|--------|--------|--------|---------|
| **Prediction Latency (p99)** | ?ms | <150ms | <100ms | <100ms |
| **ETA MAE** | baseline | ↓5% | ↓10% | <3min |
| **Model Accuracy** | ?% | 90%+ | 92%+ | 95%+ |
| **Data Quality Score** | baseline | >85% | >90% | >95% |
| **Drift Detection Speed** | N/A | 2h | 1h | <30min |
| **Retraining Duration** | N/A | <5h | <2h | <1h |
| **A/B Test Winners** | N/A | ~50% | ~70% | ~80% |

---

## Next Steps

1. ✅ **Now**: Run `./scripts/dev_bootstrap.sh`
2. **Week 1**: Get local training pipeline working
3. **Week 2**: Set up experiment tracking (MLflow)
4. **Week 3**: Deploy to staging with Kubernetes
5. **Week 4+**: Add authentication & multi-tenancy

**Authentication can wait — focus on ML excellence first!**
