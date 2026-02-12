# IntelliLog-AI: Top 1% ML System Architecture

## Vision

Build a **production-grade ML platform** that:
- Achieves **99.5% uptime** with sub-100ms ETA predictions
- **Reproduces** every prediction with full auditability
- **Monitors** model drift, data quality, and performance in real-time
- **Scales** to millions of daily deliveries across tenants
- **Learns** continuously without manual intervention
- Follows ML ops best practices used by Google, Meta, and Uber

---

## 1. Professional ML System Structure

### 1.1 Project Directory Layout

```
IntelliLog-AI/
├── src/
│   ├── backend/
│   │   ├── app/
│   │   │   ├── main.py                    # FastAPI app
│   │   │   ├── api/
│   │   │   │   └── api_v1/endpoints/
│   │   │   │       ├── predictions.py     # ETA prediction endpoints
│   │   │   │       ├── models.py          # Model management endpoints
│   │   │   │       └── monitoring.py      # Monitoring/observability
│   │   │   └── services/
│   │   │       ├── prediction_service.py  # Inference engine
│   │   │       ├── feature_service.py     # Feature engineering
│   │   │       └── monitoring_service.py  # Real-time monitoring
│   │   └── worker/
│   │       ├── training_tasks.py          # Model training pipeline
│   │       ├── evaluation_tasks.py        # Model evaluation
│   │       └── monitoring_tasks.py        # Drift detection, alerts
│   │
│   ├── ml/
│   │   ├── __init__.py
│   │   ├── models/
│   │   │   ├── eta_predictor.py          # XGBoost wrapper with versioning
│   │   │   ├── vrp_optimizer.py          # OR-Tools wrapper
│   │   │   └── base_model.py             # Abstract base class
│   │   ├── features/
│   │   │   ├── engineering.py            # Feature extraction
│   │   │   ├── transformers.py           # Preprocessing pipelines
│   │   │   ├── store.py                  # Feature store (Redis-backed)
│   │   │   └── registry.py               # Feature metadata registry
│   │   ├── training/
│   │   │   ├── pipeline.py               # End-to-end training pipeline
│   │   │   ├── hyperparameters.py        # Hyperparameter tuning
│   │   │   └── validation.py             # Cross-validation strategies
│   │   ├── evaluation/
│   │   │   ├── metrics.py                # MAE, MAPE, custom metrics
│   │   │   ├── fairness.py               # Fairness/bias detection
│   │   │   └── explainability.py         # SHAP, feature importance
│   │   ├── monitoring/
│   │   │   ├── drift_detection.py        # Kolmogorov-Smirnov, MMD
│   │   │   ├── quality_checks.py         # Data quality validation
│   │   │   └── performance_tracking.py   # Real-time metrics
│   │   ├── experiments/
│   │   │   ├── tracking.py               # MLflow integration
│   │   │   └── registry.py               # Model registry
│   │   └── inference/
│   │       ├── batch.py                  # Batch prediction engine
│   │       ├── realtime.py               # Real-time prediction server
│   │       └── caching.py                # Prediction caching with TTL
│   │
│   └── shared/
│       ├── logging.py                    # Structured logging
│       ├── tracing.py                    # Distributed tracing (OTEL)
│       ├── metrics.py                    # Metrics collection (Prometheus)
│       └── constants.py                  # Shared constants
│
├── ml/
│   ├── notebooks/
│   │   ├── 01_exploratory_data_analysis.ipynb
│   │   ├── 02_feature_engineering.ipynb
│   │   ├── 03_model_development.ipynb
│   │   ├── 04_model_evaluation.ipynb
│   │   └── 05_drift_analysis.ipynb
│   │
│   ├── data/
│   │   ├── raw/                          # Original data snapshots
│   │   ├── processed/                    # Cleaned, feature-engineered data
│   │   └── splits/                       # Train/val/test splits with metadata
│   │
│   ├── models/
│   │   ├── registry/                     # Versioned models (MLflow backend)
│   │   └── checkpoints/                  # Training checkpoints
│   │
│   └── dvc.yaml                          # DVC pipeline for reproducibility
│
├── tests/
│   ├── unit/
│   │   ├── ml/
│   │   │   ├── test_feature_engineering.py
│   │   │   ├── test_model_inference.py
│   │   │   └── test_monitoring.py
│   │   └── api/
│   │       └── test_prediction_endpoint.py
│   ├── integration/
│   │   ├── test_training_pipeline.py
│   │   └── test_a_b_testing.py
│   └── performance/
│       ├── test_inference_latency.py
│       ├── test_batch_throughput.py
│       └── test_feature_generation_speed.py
│
├── configs/
│   ├── development.yaml
│   ├── staging.yaml
│   ├── production.yaml
│   ├── ml_config.yaml                   # Model hyperparameters, thresholds
│   └── monitoring_config.yaml           # Alert thresholds, drift detection
│
├── docker/
│   ├── Dockerfile.api
│   ├── Dockerfile.worker
│   ├── Dockerfile.training               # Separate training container
│   └── docker-compose.yml
│
├── k8s/                                   # Kubernetes configs (future scaling)
│   ├── api-deployment.yaml
│   ├── worker-deployment.yaml
│   └── training-job.yaml
│
├── scripts/
│   ├── ml_scripts/
│   │   ├── train_model.py               # Direct model training script
│   │   ├── evaluate_model.py            # Offline evaluation
│   │   ├── register_model.py            # Register to model registry
│   │   └── backtest_model.py            # Historical backtesting
│   └── data_scripts/
│       ├── generate_synthetic_data.py
│       └── validate_data_quality.py
│
├── docs/
│   ├── architecture.md
│   ├── LEARNING_SYSTEM.md
│   ├── ML_SYSTEM.md                     # THIS FILE
│   ├── ML_OPS.md                        # MLOps practices
│   ├── MONITORING.md                    # Monitoring & alerts
│   └── DATA_LINEAGE.md                  # Data provenance
│
└── monitoring/
    ├── prometheus/                       # Prometheus configs
    │   └── prometheus.yml
    ├── grafana/                          # Grafana dashboards
    └── alerts/                           # Alert rules
```

---

## 2. Core ML Components

### 2.1 Feature Store (Redis-Based)

**File**: `src/ml/features/store.py`

```python
from typing import Dict, List, Any
from redis import Redis
import json
from datetime import datetime, timedelta

class FeatureStore:
    """
    Centralized feature repository for reproducibility and inference speed.
    
    Stores pre-computed features with versioning, metadata, and TTL.
    """
    
    def __init__(self, redis_client: Redis, version: str = "v1"):
        self.redis = redis_client
        self.version = version
        self.prefix = f"features:{version}"
    
    def store_features(
        self,
        entity_id: str,
        features: Dict[str, float],
        feature_set_version: str,
        ttl_hours: int = 24
    ) -> None:
        """Store features with metadata and expiration."""
        key = f"{self.prefix}:{entity_id}:{feature_set_version}"
        
        payload = {
            "features": features,
            "computed_at": datetime.utcnow().isoformat(),
            "feature_set_version": feature_set_version,
            "feature_columns": list(features.keys())
        }
        
        self.redis.setex(
            key,
            ttl_hours * 3600,
            json.dumps(payload)
        )
    
    def get_features(
        self,
        entity_id: str,
        feature_set_version: str
    ) -> Dict[str, Any]:
        """Retrieve features with cache validity check."""
        key = f"{self.prefix}:{entity_id}:{feature_set_version}"
        data = self.redis.get(key)
        
        if not data:
            return None
        
        payload = json.loads(data)
        
        # Check age of features
        computed_at = datetime.fromisoformat(payload["computed_at"])
        age_hours = (datetime.utcnow() - computed_at).total_seconds() / 3600
        
        return {
            "features": payload["features"],
            "metadata": {
                "age_hours": age_hours,
                "is_fresh": age_hours < 6  # Features older than 6h marked stale
            }
        }
```

### 2.2 Model Base Class with Versioning

**File**: `src/ml/models/base_model.py`

```python
from abc import ABC, abstractmethod
from typing import Dict, Tuple, Any
import json
from datetime import datetime
import hashlib

class BaseMLModel(ABC):
    """
    Abstract base class for all ML models with versioning, 
    explainability, and monitoring built-in.
    """
    
    def __init__(
        self,
        model_name: str,
        model_type: str,  # 'xgboost', 'linear', 'ensemble'
        features: List[str],
        hyperparameters: Dict[str, Any],
        version: str = None
    ):
        self.model_name = model_name
        self.model_type = model_type
        self.features = features
        self.hyperparameters = hyperparameters
        self.version = version or self._generate_version()
        self.artifact_checksum = None
        self.training_metadata = {}
    
    def _generate_version(self) -> str:
        """Generate semantic version based on timestamp."""
        return f"v_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
    
    @abstractmethod
    def train(self, X: np.ndarray, y: np.ndarray) -> Dict[str, float]:
        """Fit model to training data, return training metrics."""
        pass
    
    @abstractmethod
    def predict(self, X: np.ndarray) -> Tuple[np.ndarray, Dict[str, Any]]:
        """
        Make predictions with confidence/uncertainty estimates.
        
        Returns:
            predictions: Model predictions
            metadata: {
                'confidence': float (0-1),
                'is_ood': bool,  # Out-of-distribution detection
                'feature_importance': Dict[str, float],
                'explanation': str
            }
        """
        pass
    
    def get_feature_importance(self) -> Dict[str, float]:
        """Return feature importance scores for explainability."""
        pass
    
    def to_artifact(self) -> bytes:
        """Serialize model to bytes for storage."""
        pass
    
    @classmethod
    def from_artifact(cls, artifact: bytes) -> 'BaseMLModel':
        """Deserialize model from bytes."""
        pass
    
    def compute_checksum(self) -> str:
        """Compute SHA256 of model artifact for integrity checking."""
        artifact = self.to_artifact()
        self.artifact_checksum = hashlib.sha256(artifact).hexdigest()
        return self.artifact_checksum
    
    def get_metadata(self) -> Dict[str, Any]:
        """Return complete model metadata for registry."""
        return {
            "model_name": self.model_name,
            "version": self.version,
            "model_type": self.model_type,
            "features": self.features,
            "hyperparameters": self.hyperparameters,
            "artifact_checksum": self.artifact_checksum,
            "created_at": datetime.utcnow().isoformat(),
            "training_metadata": self.training_metadata
        }
```

### 2.3 Advanced ETA Predictor with Explainability

**File**: `src/ml/models/eta_predictor.py`

```python
import xgboost as xgb
import numpy as np
import shap
from typing import Dict, Tuple, Any

class ETAPredictor(BaseMLModel):
    """
    Production-grade ETA prediction model with:
    - Uncertainty quantification
    - Out-of-distribution detection
    - SHAP-based explainability
    - Confidence calibration
    """
    
    def __init__(self, features: List[str], hyperparameters: Dict):
        super().__init__("eta_prediction", "xgboost", features, hyperparameters)
        self.model = None
        self.calibrator = None  # For calibrated probabilities
        self.shap_explainer = None
        self.feature_bounds = {}  # For OOD detection
    
    def train(self, X: np.ndarray, y: np.ndarray) -> Dict[str, float]:
        """Train XGBoost with validation monitoring."""
        
        # Split data
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=0.2, random_state=42
        )
        
        # Record feature bounds for OOD detection
        self.feature_bounds = {
            col: (X_train[:, i].min(), X_train[:, i].max())
            for i, col in enumerate(self.features)
        }
        
        # Train XGBoost
        self.model = xgb.XGBRegressor(
            **self.hyperparameters,
            random_state=42,
            verbosity=1
        )
        
        eval_set = [(X_val, y_val)]
        self.model.fit(
            X_train, y_train,
            eval_set=eval_set,
            early_stopping_rounds=50,
            verbose=False
        )
        
        # Initialize SHAP explainer for later use
        self.shap_explainer = shap.TreeExplainer(self.model)
        
        # Evaluate and store metrics
        train_mae = mean_absolute_error(y_train, self.model.predict(X_train))
        val_mae = mean_absolute_error(y_val, self.model.predict(X_val))
        
        self.training_metadata = {
            "train_mae": float(train_mae),
            "val_mae": float(val_mae),
            "train_samples": len(X_train),
            "val_samples": len(X_val),
            "best_iteration": self.model.best_iteration
        }
        
        return self.training_metadata
    
    def predict(self, X: np.ndarray) -> Tuple[np.ndarray, Dict[str, Any]]:
        """
        Make predictions with full context.
        
        Returns:
            predictions: ETA in minutes
            metadata: {
                'confidence': 0-1 (based on variance in ensemble),
                'is_ood': bool,
                'explanation': top 3 feature importances,
                'quantiles': {0.05, 0.25, 0.5, 0.75, 0.95}
            }
        """
        
        # Base predictions
        predictions = self.model.predict(X)
        
        # Out-of-distribution detection
        is_ood = self._detect_ood(X)
        
        # Feature importance (SHAP values)
        shap_values = self.shap_explainer.shap_values(X)
        
        # Confidence (inverse of prediction std dev)
        confidence = np.exp(-np.std(shap_values, axis=1)) / (1 + np.std(shap_values, axis=1))
        
        metadata = {
            'confidence': float(np.mean(confidence)),
            'is_ood': is_ood,
            'feature_importance': self._get_top_features(shap_values),
            'explanation': f"Prediction based on distance ({shap_values[0]}min impact)"
        }
        
        return predictions, metadata
    
    def _detect_ood(self, X: np.ndarray) -> np.ndarray:
        """Detect out-of-distribution inputs."""
        ood = np.zeros(len(X), dtype=bool)
        
        for i, col in enumerate(self.features):
            min_val, max_val = self.feature_bounds[col]
            ood |= (X[:, i] < min_val) | (X[:, i] > max_val)
        
        return ood
    
    def _get_top_features(self, shap_values, top_k=3) -> Dict[str, float]:
        """Get top K feature importances."""
        importance = np.abs(shap_values).mean(axis=0)
        top_indices = np.argsort(importance)[-top_k:]
        
        return {
            self.features[i]: float(importance[i])
            for i in top_indices
        }
```

### 2.4 Training Pipeline with DVC

**File**: `ml/dvc.yaml`

```yaml
# DVC Pipeline for reproducible model training
stages:
  prepare_data:
    cmd: python scripts/ml_scripts/prepare_data.py
    deps:
      - data/raw/  # Raw delivery data
    outs:
      - data/processed/train.csv
      - data/processed/test.csv
    metrics:
      - data/processed/data_quality.json:
          cache: false

  feature_engineering:
    cmd: python scripts/ml_scripts/feature_engineering.py
    deps:
      - data/processed/train.csv
      - src/ml/features/engineering.py
    outs:
      - data/processed/features_train.pkl
      - data/processed/features_test.pkl
    metrics:
      - data/processed/feature_stats.json:
          cache: false

  train_model:
    cmd: python scripts/ml_scripts/train_model.py
    deps:
      - data/processed/features_train.pkl
      - src/ml/models/eta_predictor.py
    outs:
      - ml/models/registry/latest.pkl
    metrics:
      - ml/models/metrics.json:
          cache: false

  evaluate_model:
    cmd: python scripts/ml_scripts/evaluate_model.py
    deps:
      - ml/models/registry/latest.pkl
      - data/processed/features_test.pkl
    metrics:
      - ml/models/evaluation.json:
          cache: false

  register_model:
    cmd: python scripts/ml_scripts/register_model.py
    deps:
      - ml/models/registry/latest.pkl
      - ml/models/evaluation.json
    outs:
      - ml/models/registry/production.pkl
```

---

## 3. Monitoring & Observability (Enterprise-Grade)

### 3.1 Real-Time Metrics Dashboard

**File**: `src/ml/monitoring/performance_tracking.py`

```python
from prometheus_client import Counter, Histogram, Gauge, CollectorRegistry
import time

class MLMetricsCollector:
    """
    Prometheus-compatible metrics for production monitoring.
    
    Tracks: prediction latency, accuracy, drift, data quality.
    """
    
    def __init__(self, registry: CollectorRegistry = None):
        self.registry = registry or CollectorRegistry()
        
        # Prediction metrics
        self.prediction_latency = Histogram(
            'prediction_latency_ms',
            'ETA prediction latency in milliseconds',
            buckets=[10, 25, 50, 100, 250, 500],
            registry=self.registry
        )
        
        self.prediction_error = Histogram(
            'prediction_error_minutes',
            'Absolute error between predicted and actual ETA',
            buckets=[1, 3, 5, 10, 15, 30],
            registry=self.registry
        )
        
        self.prediction_accuracy = Gauge(
            'prediction_accuracy_percent',
            'Percentage of predictions within 5-min threshold',
            registry=self.registry
        )
        
        # Model health metrics
        self.model_drift_score = Gauge(
            'model_drift_score',
            'Kolmogorov-Smirnov drift detection score',
            registry=self.registry
        )
        
        self.data_quality_score = Gauge(
            'data_quality_score',
            'Data quality score (0-100)',
            registry=self.registry
        )
        
        # Feature metrics
        self.feature_staleness = Histogram(
            'feature_age_hours',
            'Age of cached features in hours',
            registry=self.registry
        )
    
    def record_prediction(self, latency_ms: float, error_minutes: float = None):
        """Record a single prediction."""
        self.prediction_latency.observe(latency_ms)
        
        if error_minutes is not None:
            self.prediction_error.observe(abs(error_minutes))
    
    def update_accuracy(self, accuracy_percent: float):
        """Update real-time accuracy gauge."""
        self.prediction_accuracy.set(accuracy_percent)
    
    def update_drift_score(self, score: float):
        """Update drift detection score."""
        self.model_drift_score.set(score)
```

### 3.2 Drift Detection Using Statistical Tests

**File**: `src/ml/monitoring/drift_detection.py`

```python
from scipy.stats import ks_2samp, anderson_ksamp
import numpy as np

class DriftDetector:
    """
    Multi-method drift detection:
    - Kolmogorov-Smirnov (distribution changes)
    - Maximum Mean Discrepancy (feature distribution)
    - Prediction distribution changes
    """
    
    def __init__(self, baseline_data: np.ndarray, significance_level: float = 0.05):
        self.baseline_data = baseline_data
        self.baseline_mean = baseline_data.mean()
        self.baseline_std = baseline_data.std()
        self.significance_level = significance_level
    
    def ks_test(self, current_data: np.ndarray) -> Dict[str, float]:
        """
        Kolmogorov-Smirnov test for distribution change.
        
        H0: Current data comes from same distribution as baseline
        """
        statistic, p_value = ks_2samp(self.baseline_data, current_data)
        
        return {
            'test': 'ks',
            'statistic': float(statistic),
            'p_value': float(p_value),
            'drift_detected': p_value < self.significance_level,
            'severity': self._severity_level(p_value)
        }
    
    def mmd_test(self, current_data: np.ndarray) -> Dict[str, float]:
        """
        Maximum Mean Discrepancy for kernel-based distribution difference.
        More sensitive to multivariate drifts.
        """
        mmd = self._compute_mmd(self.baseline_data, current_data)
        threshold = self.baseline_std * 0.5  # Adaptive threshold
        
        return {
            'test': 'mmd',
            'mmd_value': float(mmd),
            'threshold': float(threshold),
            'drift_detected': mmd > threshold,
            'severity': 'high' if mmd > threshold * 2 else 'medium'
        }
    
    def _compute_mmd(self, X: np.ndarray, Y: np.ndarray) -> float:
        """Compute Maximum Mean Discrepancy using RBF kernel."""
        gamma = 1.0 / X.shape[1] if X.ndim > 1 else 1.0
        
        K_XX = np.exp(-gamma * np.sum((X[:, None] - X[None, :]) ** 2, axis=2))
        K_YY = np.exp(-gamma * np.sum((Y[:, None] - Y[None, :]) ** 2, axis=2))
        K_XY = np.exp(-gamma * np.sum((X[:, None] - Y[None, :]) ** 2, axis=2))
        
        mmd_sq = np.mean(K_XX) + np.mean(K_YY) - 2 * np.mean(K_XY)
        return np.sqrt(np.maximum(mmd_sq, 0))
    
    def _severity_level(self, p_value: float) -> str:
        if p_value < 0.001:
            return 'critical'
        elif p_value < 0.01:
            return 'high'
        elif p_value < 0.05:
            return 'medium'
        else:
            return 'low'
```

### 3.3 Grafana Dashboard JSON

**File**: `monitoring/grafana/eta-prediction-dashboard.json`

```json
{
  "dashboard": {
    "title": "ETA Prediction - Production Monitoring",
    "panels": [
      {
        "title": "Prediction Latency (p95, p99)",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, prediction_latency_ms)"
          },
          {
            "expr": "histogram_quantile(0.99, prediction_latency_ms)"
          }
        ],
        "alert": {
          "condition": "p99 > 500ms",
          "duration": "5m"
        }
      },
      {
        "title": "Model Accuracy (Within 5 min)",
        "targets": [{"expr": "prediction_accuracy_percent"}],
        "alert": {
          "condition": "accuracy < 90%",
          "duration": "1h"
        }
      },
      {
        "title": "Data Drift Score (KS Test)",
        "targets": [{"expr": "model_drift_score"}],
        "alert": {
          "condition": "drift > 0.3",
          "severity": "critical"
        }
      },
      {
        "title": "Prediction Error Distribution",
        "targets": [{"expr": "histogram_bucket(prediction_error_minutes)"}]
      }
    ]
  }
}
```

---

## 4. Production-Ready API Endpoints

### 4.1 Prediction Endpoint with Context

**File**: `src/backend/app/api/api_v1/endpoints/predictions.py`

```python
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel
from typing import List, Dict, Any
import time

router = APIRouter(prefix="/predictions", tags=["predictions"])

class PredictionRequest(BaseModel):
    order_id: str
    distance_km: float
    traffic_condition: str
    weather_condition: str
    time_of_day: str
    vehicle_type: str
    driver_id: str

class PredictionResponse(BaseModel):
    order_id: str
    predicted_eta_minutes: int
    confidence_score: float
    explanation: Dict[str, Any]
    model_version: str
    processing_time_ms: float
    is_ood: bool  # Out-of-distribution flag

@router.post("/eta", response_model=PredictionResponse)
async def predict_eta(
    request: PredictionRequest,
    background_tasks: BackgroundTasks
) -> PredictionResponse:
    """
    Production ETA prediction endpoint.
    
    - Uses feature store for cached features
    - Records latency metrics
    - Detects out-of-distribution inputs
    - Provides SHAP-based explanations
    """
    
    start_time = time.time()
    
    try:
        # 1. Get cached features from feature store
        features = feature_store.get_features(
            entity_id=request.order_id,
            feature_set_version="v1"
        )
        
        if not features:
            # Feature miss: compute on-the-fly
            features = await feature_service.compute_features(request)
        
        # 2. Load production model
        model = model_registry.get_production_model("eta_prediction")
        
        # 3. Make prediction with explainability
        eta_minutes, metadata = model.predict(features['features'])
        
        # 4. Check model version availability
        model_version = model.version
        
        # 5. Record metrics asynchronously
        latency_ms = (time.time() - start_time) * 1000
        background_tasks.add_task(
            metrics_collector.record_prediction,
            latency_ms=latency_ms,
            order_id=request.order_id,
            model_version=model_version
        )
        
        return PredictionResponse(
            order_id=request.order_id,
            predicted_eta_minutes=int(eta_minutes[0]),
            confidence_score=metadata['confidence'],
            explanation=metadata['feature_importance'],
            model_version=model_version,
            processing_time_ms=latency_ms,
            is_ood=metadata['is_ood']
        )
    
    except Exception as e:
        logger.error(f"Prediction error: {str(e)}", extra={
            "order_id": request.order_id,
            "request": request.dict()
        })
        raise HTTPException(status_code=500, detail="Prediction service unavailable")

@router.get("/models/info")
async def get_model_info() -> Dict[str, Any]:
    """Return production model metadata for auditing."""
    production_model = model_registry.get_production_model("eta_prediction")
    
    return {
        "model_name": production_model.model_name,
        "version": production_model.version,
        "training_metadata": production_model.training_metadata,
        "feature_list": production_model.features,
        "last_training_date": production_model.training_metadata.get("training_date"),
        "artifact_checksum": production_model.artifact_checksum
    }
```

---

## 5. Data Quality & Lineage

### 5.1 Data Validation Pipeline

**File**: `src/ml/monitoring/quality_checks.py`

```python
from typing import Dict, List
import pandas as pd

class DataQualityValidator:
    """
    Comprehensive data quality checks before model training.
    Ensures data lineage and reproducibility.
    """
    
    def __init__(self, schema: Dict[str, str]):
        self.schema = schema
        self.checks_passed = []
        self.checks_failed = []
    
    def validate(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Run all quality checks."""
        results = {}
        
        # Schema validation
        results['schema'] = self._check_schema(df)
        
        # Missing values
        results['completeness'] = self._check_completeness(df)
        
        # Outliers
        results['outliers'] = self._check_outliers(df)
        
        # Duplicate rows
        results['duplicates'] = self._check_duplicates(df)
        
        # Distribution changes
        results['drift'] = self._check_drift(df)
        
        # Compute overall quality score
        results['quality_score'] = self._compute_quality_score(results)
        
        return results
    
    def _check_schema(self, df: pd.DataFrame) -> Dict:
        """Verify column names and types."""
        expected_cols = set(self.schema.keys())
        actual_cols = set(df.columns)
        
        missing = expected_cols - actual_cols
        extra = actual_cols - expected_cols
        
        return {
            'valid': len(missing) == 0 and len(extra) == 0,
            'missing_columns': list(missing),
            'extra_columns': list(extra)
        }
    
    def _check_completeness(self, df: pd.DataFrame) -> Dict:
        """Check for missing/null values."""
        missing_pct = df.isnull().sum() / len(df) * 100
        
        return {
            'valid': (missing_pct < 5).all(),
            'missing_by_column': missing_pct.to_dict()
        }
    
    def _compute_quality_score(self, results: Dict) -> float:
        """Aggregate quality score (0-100)."""
        score = 100
        
        if not results['schema']['valid']:
            score -= 20
        if not results['completeness']['valid']:
            score -= 20
        
        return max(score, 0)
```

---

## 6. Experiment Tracking & Model Registry

### 6.1 MLflow Integration

**File**: `src/ml/experiments/tracking.py`

```python
import mlflow
from typing import Dict, Any
import json

class ExperimentTracker:
    """
    Central experiment tracking using MLflow.
    Logs: hyperparameters, metrics, model artifacts, data lineage.
    """
    
    def __init__(self, tracking_uri: str = "http://mlflow:5000"):
        mlflow.set_tracking_uri(tracking_uri)
    
    def log_training(
        self,
        experiment_name: str,
        model_name: str,
        hyperparameters: Dict[str, Any],
        metrics: Dict[str, float],
        model_artifact,
        data_lineage: Dict[str, Any]
    ) -> str:
        """
        Log complete training run with full context.
        
        Returns: Run ID
        """
        
        with mlflow.start_run(experiment_name=experiment_name) as run:
            # Log hyperparameters
            mlflow.log_params(hyperparameters)
            
            # Log metrics
            for metric_name, metric_value in metrics.items():
                mlflow.log_metric(metric_name, metric_value)
            
            # Log model artifact
            mlflow.sklearn.log_model(model_artifact, "model")
            
            # Log data lineage (critical for reproducibility)
            mlflow.log_dict(data_lineage, "data_lineage.json")
            
            # Log tags for filtering
            mlflow.set_tags({
                "model_type": "xgboost",
                "task": "eta_prediction",
                "framework": "scikit-learn"
            })
            
            return run.info.run_id
    
    def get_best_model(self, experiment_name: str, metric: str = "val_mae") -> str:
        """Retrieve best model from experiment history."""
        experiment = mlflow.get_experiment_by_name(experiment_name)
        
        best_run = mlflow.search_runs(
            experiment_ids=[experiment.experiment_id],
            order_by=[f"metrics.{metric} ASC"],
            max_results=1
        ).iloc[0]
        
        return best_run.run_id
```

---

## 7. Testing Strategy

### 7.1 ML Unit Tests

**File**: `tests/unit/ml/test_model_inference.py`

```python
import pytest
import numpy as np
from src.ml.models.eta_predictor import ETAPredictor

class TestETAPredictor:
    
    @pytest.fixture
    def model(self):
        hyperparams = {
            'n_estimators': 10,
            'max_depth': 5,
            'learning_rate': 0.1
        }
        return ETAPredictor(
            features=['distance', 'traffic', 'time_of_day'],
            hyperparameters=hyperparams
        )
    
    def test_prediction_shape(self, model):
        """Predictions should match input shape."""
        X = np.random.randn(100, 3)
        predictions, _ = model.predict(X)
        
        assert predictions.shape == (100,)
    
    def test_confidence_score_valid_range(self, model):
        """Confidence scores should be between 0 and 1."""
        X = np.random.randn(10, 3)
        _, metadata = model.predict(X)
        
        assert 0 <= metadata['confidence'] <= 1
    
    def test_ood_detection(self, model):
        """Model should detect out-of-distribution inputs."""
        X_normal = np.random.normal(0, 1, (10, 3))
        X_ood = np.random.uniform(100, 1000, (5, 3))
        
        _, metadata_normal = model.predict(X_normal)
        _, metadata_ood = model.predict(X_ood)
        
        assert not metadata_normal['is_ood']
        assert metadata_ood['is_ood']
```

### 7.2 Performance Tests

**File**: `tests/performance/test_inference_latency.py`

```python
import pytest
import time
from src.backend.app.api.api_v1.endpoints.predictions import predict_eta

class TestInferencePerformance:
    
    @pytest.mark.benchmark
    async def test_prediction_latency_sla(self):
        """Predictions must complete within 100ms (p99)."""
        latencies = []
        
        for _ in range(1000):
            request = create_dummy_request()
            
            start = time.time()
            await predict_eta(request)
            latencies.append((time.time() - start) * 1000)
        
        p99_latency = np.percentile(latencies, 99)
        
        assert p99_latency < 100, f"P99 latency {p99_latency}ms exceeds SLA"
```

---

## 8. Production Deployment Checklist

- [ ] **Model Versioning**: All models registered with checksums
- [ ] **Feature Store**: Redis-backed with TTL
- [ ] **Monitoring**: Prometheus metrics + Grafana dashboards
- [ ] **Drift Detection**: Multi-method KS + MMD tests
- [ ] **Data Validation**: Pre-training quality checks
- [ ] **Experiment Tracking**: MLflow with full lineage
- [ ] **Testing**: Unit + integration + performance tests
- [ ] **Documentation**: API docs, model cards, runbooks
- [ ] **Alerting**: PagerDuty integration for critical alerts
- [ ] **Deployment**: Blue-green with automated rollback

---

## 9. Success Criteria (Top 1% ML Systems)

| Metric | Target | Status |
|--------|--------|--------|
| **Prediction Latency** | p99 < 100ms | 🎯 |
| **ETA Accuracy** | MAE < 3 min (92%+ within 5min) | 🎯 |
| **Model Drift Detection** | Detects within 1 hour | 🎯 |
| **Training Reproducibility** | 100% (DVC + Git) | 🎯 |
| **Data Quality Score** | > 95% | 🎯 |
| **Model Version Control** | All versions auditable | 🎯 |
| **Monitoring Coverage** | 100% of critical paths | 🎯 |
| **A/B Test Significance** | p < 0.05 before promotion | 🎯 |

---

This architecture follows practices from **Uber's Michelangelo**, **Airbnb's ML Platform**, and **Google's PAIRS** papers.
