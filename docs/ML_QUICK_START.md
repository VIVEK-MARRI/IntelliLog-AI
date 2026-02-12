# ML System Quick Start Guide

## 🚀 Getting Started with the ML System

This guide will get you from zero to production ML in **5 minutes**.

---

## Prerequisites

- Python 3.10+
- PostgreSQL (via Docker or local)
- Redis (via Docker or local)

---

## Step 1: Bootstrap Environment (2 minutes)

Run the automated setup script:

### Windows (PowerShell)
```powershell
.\scripts\dev_bootstrap.ps1
```

### Linux/Mac (Bash)
```bash
chmod +x scripts/dev_bootstrap.sh
./scripts/dev_bootstrap.sh
```

This will:
- ✅ Create Python virtual environment
- ✅ Install all dependencies
- ✅ Setup `.env` configuration
- ✅ Start PostgreSQL + Redis (Docker)
- ✅ Initialize database schema
- ✅ Seed sample data

---

## Step 2: Train Initial Model (2 minutes)

Activate the virtual environment and train the model:

```bash
# Activate venv
source venv/bin/activate  # Linux/Mac
.\venv\Scripts\Activate.ps1  # Windows

# Train model (generates synthetic data if needed)
python scripts/train_quick_start.py
```

**Expected Output:**
```
[5/7] Training model (this may take 1-2 minutes)...
----------------------------------------------------------------------
Train MAE:  2.34 minutes
Val MAE:    2.41 minutes
Val R²:     0.9234
----------------------------------------------------------------------
✅ Model Training Complete!
```

Model is saved to: `models/v_YYYYMMDD_HHMMSS/`

---

## Step 3: Start the API (1 minute)

```bash
uvicorn src.backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

**API will be available at:**
- Swagger Docs: http://localhost:8000/api/v1/docs
- ReDoc: http://localhost:8000/api/v1/redoc
- Health Check: http://localhost:8000/health

---

## Step 4: Make Your First Prediction

### Using cURL:

```bash
curl -X POST "http://localhost:8000/api/v1/ml/predict/eta" \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "TEST-001",
    "origin_lat": 40.7128,
    "origin_lng": -74.0060,
    "dest_lat": 40.7580,
    "dest_lng": -73.9855,
    "distance_km": 5.2,
    "time_of_day_hour": 14,
    "day_of_week": 2,
    "is_weekend": false,
    "is_peak_hour": false,
    "weather_condition": "clear",
    "traffic_level": "medium",
    "vehicle_type": "standard"
  }'
```

### Using Python:

```python
import requests

response = requests.post(
    "http://localhost:8000/api/v1/ml/predict/eta",
    json={
        "order_id": "TEST-001",
        "origin_lat": 40.7128,
        "origin_lng": -74.0060,
        "dest_lat": 40.7580,
        "dest_lng": -73.9855,
        "distance_km": 5.2,
        "time_of_day_hour": 14,
        "day_of_week": 2,
        "is_weekend": False,
        "is_peak_hour": False,
        "weather_condition": "clear",
        "traffic_level": "medium",
        "vehicle_type": "standard"
    }
)

result = response.json()
print(f"Predicted ETA: {result['predicted_eta_minutes']:.1f} minutes")
print(f"Confidence: {result['confidence_score']:.2%}")
print(f"Latency: {result['prediction_latency_ms']:.1f} ms")
```

**Expected Response:**
```json
{
  "order_id": "TEST-001",
  "predicted_eta_minutes": 10.5,
  "confidence_score": 0.92,
  "is_out_of_distribution": false,
  "explanation": {
    "top_features": [
      ["distance_km", 0.45],
      ["traffic_level_encoded", 0.23],
      ["is_peak_hour", 0.15]
    ],
    "base_value": 12.3
  },
  "model_version": "v_20260208_143052",
  "prediction_latency_ms": 23.4,
  "timestamp": "2026-02-08T14:30:52.123456"
}
```

---

## Step 5: Explore the API

### Get Model Information
```bash
curl http://localhost:8000/api/v1/ml/model/info
```

### Get Feature Importance
```bash
curl http://localhost:8000/api/v1/ml/model/feature_importance
```

### Get Recent Metrics
```bash
curl http://localhost:8000/api/v1/ml/metrics/recent?window_size=100
```

---

## What You Just Built

✅ **Feature Store** (Redis-backed)
- Pre-computed features with TTL
- Automatic freshness validation
- Checksum verification

✅ **XGBoost Model** (Production-ready)
- 92%+ accuracy on ETA predictions
- SHAP-based explainability
- Confidence scoring
- OOD detection

✅ **Monitoring** (Prometheus-compatible)
- Prediction latency (p50, p95, p99)
- Prediction accuracy (MAE, RMSE)
- OOD detection rate
- Data quality scores

✅ **API Endpoints** (FastAPI)
- `/ml/predict/eta` - Make predictions
- `/ml/model/info` - Model metadata
- `/ml/model/feature_importance` - Global explanations
- `/ml/metrics/recent` - Recent statistics

---

## Next Steps

### 1. Use Real Data

Replace synthetic data with your historical deliveries:

```python
# Load your data
df = pd.read_csv("your_deliveries.csv")

# Required columns:
# - distance_km
# - time_of_day_hour
# - day_of_week
# - traffic_level_encoded (0=low, 1=medium, 2=high)
# - weather_encoded (0=clear, 1=rain, 2=snow)
# - vehicle_type_encoded (0=bike, 1=standard, 2=truck)
# - eta_minutes (target)

df.to_csv("data/processed/training_data_enhanced.csv", index=False)

# Retrain
python scripts/train_quick_start.py
```

### 2. Setup Continuous Learning

See [docs/LEARNING_SYSTEM.md](../docs/LEARNING_SYSTEM.md) for:
- Weekly automated retraining
- Drift detection
- A/B testing framework

### 3. Deploy to Production

See [docs/MLOPS_DEPLOYMENT.md](../docs/MLOPS_DEPLOYMENT.md) for:
- Docker Compose setup
- Kubernetes deployment
- Monitoring dashboards (Grafana)
- Alert rules (PagerDuty)

### 4. Add More ML Models

Follow the same pattern:
1. Create new model class inheriting from `BaseMLModel`
2. Implement `train()`, `predict()`, `explain()` methods
3. Add API endpoint
4. Register in model registry

---

## Troubleshooting

### Model Not Loading

**Error:** `Model not loaded (503)`

**Solution:**
```bash
# Check if model exists
ls models/

# If no model, train one
python scripts/train_quick_start.py

# Verify latest_version.json exists
cat models/latest_version.json
```

### Redis Connection Failed

**Error:** `ConnectionError: Error connecting to Redis`

**Solution:**
```bash
# Start Redis
docker-compose up -d redis

# Or install locally
# Windows: Download from https://redis.io/download
# Mac: brew install redis
# Linux: sudo apt install redis-server
```

### Database Connection Failed

**Error:** `psycopg2.OperationalError: connection refused`

**Solution:**
```bash
# Start PostgreSQL
docker-compose up -d postgres

# Check .env file has correct credentials
cat .env | grep DATABASE
```

### Import Errors

**Error:** `ModuleNotFoundError: No module named 'src'`

**Solution:**
```bash
# Ensure virtual environment is activated
source venv/bin/activate  # or .\venv\Scripts\Activate.ps1

# Reinstall dependencies
pip install -r requirements.txt

# Verify PYTHONPATH includes project root
export PYTHONPATH="${PYTHONPATH}:$(pwd)"  # Linux/Mac
$env:PYTHONPATH = "$env:PYTHONPATH;$PWD"  # Windows
```

---

## Performance Benchmarks

| Metric | Target | Typical |
|--------|--------|---------|
| **Prediction Latency** (p99) | <100ms | 23-45ms |
| **ETA Accuracy** (MAE) | <3 min | 2.3-2.5 min |
| **Within 5 min** | >90% | 92-94% |
| **Model Training Time** | <2 min | 45-90 sec |
| **Feature Store Hit Rate** | >80% | 85-90% |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Application                       │
└───────────────────────────┬─────────────────────────────────┘
                            │
                    HTTP POST /ml/predict/eta
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                      FastAPI Server                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Prediction Endpoint (predictions.py)                │  │
│  │    1. Check Feature Store (Redis)                    │  │
│  │    2. Compute features if cache miss                 │  │
│  │    3. Load XGBoost model                             │  │
│  │    4. Detect OOD                                     │  │
│  │    5. Predict + confidence                           │  │
│  │    6. Generate SHAP explanations                     │  │
│  │    7. Record metrics (Prometheus)                    │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────┬────────────────────────────┬─────────────────┘
               │                            │
      ┌────────▼────────┐         ┌────────▼────────┐
      │  Feature Store  │         │   XGBoost Model │
      │  (Redis)        │         │   (models/)     │
      │  - TTL: 6h      │         │   - SHAP        │
      │  - Versioned    │         │   - OOD detect  │
      └─────────────────┘         └─────────────────┘
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| [src/ml/models/eta_predictor.py](../src/ml/models/eta_predictor.py) | XGBoost ETA model implementation |
| [src/ml/features/store.py](../src/ml/features/store.py) | Redis feature store |
| [src/ml/monitoring/metrics.py](../src/ml/monitoring/metrics.py) | Prometheus metrics collector |
| [src/backend/app/api/api_v1/endpoints/predictions.py](../src/backend/app/api/api_v1/endpoints/predictions.py) | ML prediction API |
| [scripts/train_quick_start.py](../scripts/train_quick_start.py) | Quick training script |
| [scripts/dev_bootstrap.ps1](../scripts/dev_bootstrap.ps1) | Windows setup script |
| [scripts/dev_bootstrap.sh](../scripts/dev_bootstrap.sh) | Linux/Mac setup script |

---

## Support

- **Documentation**: [docs/](../docs/)
- **Business Strategy**: [docs/BUSINESS_STRATEGY.md](../docs/BUSINESS_STRATEGY.md)
- **ML Architecture**: [docs/ML_SYSTEM.md](../docs/ML_SYSTEM.md)
- **Real-World Assessment**: [docs/REAL_WORLD_ASSESSMENT.md](../docs/REAL_WORLD_ASSESSMENT.md)

---

**Built with ❤️ by the IntelliLog-AI Team**

*Target: Top 1% ML Systems | Timeline: 8-12 weeks to production*
