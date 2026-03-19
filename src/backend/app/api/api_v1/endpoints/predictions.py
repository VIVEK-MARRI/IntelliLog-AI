"""
ML Prediction API Endpoints
Production-ready ETA predictions with explainability and monitoring
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List
import hashlib
import json
import pandas as pd
import time
from datetime import datetime
from pathlib import Path

import redis
from sqlalchemy.orm import Session

from src.ml.models.eta_predictor import ETAPredictor
from src.ml.features.store import get_feature_store
from src.ml.monitoring.metrics import get_metrics_collector
from src.backend.app.api import deps
from src.backend.app.core.auth import AuthenticatedPrincipal
from src.backend.app.core.config import settings
from src.backend.app.db.models import DeliveryFeedback

router = APIRouter()

# Global model instance (loaded on startup)
_model: Optional[ETAPredictor] = None
_model_cache: Dict[str, ETAPredictor] = {}
_feature_store = None
_metrics_collector = None


def _get_model_by_version(model_version: str) -> ETAPredictor:
    """Load and cache ETAPredictor model artifacts for a specific version."""
    if model_version in _model_cache:
        return _model_cache[model_version]

    model_path = Path("models") / model_version
    if not model_path.exists():
        raise FileNotFoundError(f"Model version path not found: {model_path}")

    model_instance = ETAPredictor(version=model_version)
    model_instance.load(model_path)
    _model_cache[model_version] = model_instance
    return model_instance


def _resolve_ab_test_routing(tenant_id: str, order_id: str) -> Optional[Dict[str, str]]:
    """Resolve active A/B route assignment using deterministic order-id hashing."""
    redis_client = redis.from_url(settings.REDIS_FEATURE_STORE_URL, decode_responses=True)
    payload_raw = redis_client.get(f"ab_test:{tenant_id}:active")
    if not payload_raw:
        return None

    payload = json.loads(payload_raw)
    model_a = str(payload.get("model_a", "")).strip()
    model_b = str(payload.get("model_b", "")).strip()
    test_id = str(payload.get("test_id", "")).strip()
    if not model_a or not model_b or not test_id:
        return None

    bucket = int(hashlib.sha256(order_id.encode("utf-8")).hexdigest(), 16) % 2
    selected_model = model_a if bucket == 0 else model_b
    group = "A" if bucket == 0 else "B"

    return {
        "test_id": test_id,
        "model_version": selected_model,
        "group": group,
    }


def get_model() -> ETAPredictor:
    """Get loaded model instance"""
    global _model
    if _model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return _model


def get_feature_store_dependency():
    """Get feature store instance"""
    global _feature_store
    if _feature_store is None:
        _feature_store = get_feature_store()
    return _feature_store


def get_metrics_dependency():
    """Get metrics collector"""
    global _metrics_collector
    if _metrics_collector is None:
        _metrics_collector = get_metrics_collector()
    return _metrics_collector


# Request/Response Models
class ETAPredictionRequest(BaseModel):
    """Request schema for ETA prediction"""
    tenant_id: str = Field("default", description="Tenant identifier for data isolation")
    order_id: str = Field(..., description="Unique order identifier")
    origin_lat: float = Field(..., ge=-90, le=90)
    origin_lng: float = Field(..., ge=-180, le=180)
    dest_lat: float = Field(..., ge=-90, le=90)
    dest_lng: float = Field(..., ge=-180, le=180)
    distance_km: float = Field(..., gt=0, description="Distance in kilometers")
    time_of_day_hour: int = Field(..., ge=0, lt=24)
    day_of_week: int = Field(..., ge=0, lt=7)
    is_weekend: bool = False
    is_peak_hour: bool = False
    weather_condition: Optional[str] = Field(None, description="clear, rain, snow, etc.")
    traffic_level: Optional[str] = Field("medium", description="low, medium, high")
    vehicle_type: Optional[str] = Field("standard", description="standard, bike, truck")
    
    # Optional: pre-computed features
    features: Optional[Dict[str, float]] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "order_id": "ORD-12345",
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
        }


class ETAPredictionResponse(BaseModel):
    """Response schema for ETA prediction"""
    tenant_id: str
    order_id: str
    eta_minutes: float
    eta_p10: float
    eta_p90: float
    interval_width_minutes: float
    confidence_within_5min: float = Field(..., ge=0, le=1)
    is_ood: bool
    top_features: Dict[str, float]
    explanation: str
    model_version: str
    prediction_latency_ms: float
    timestamp: str


class ModelInfoResponse(BaseModel):
    """Model information response"""
    model_name: str
    version: str
    status: str
    metadata: Dict[str, Any]


# API Endpoints
@router.post("/predict/eta", response_model=ETAPredictionResponse)
async def predict_eta(
    request: ETAPredictionRequest,
    background_tasks: BackgroundTasks,
    model: ETAPredictor = Depends(get_model),
    feature_store = Depends(get_feature_store_dependency),
    metrics = Depends(get_metrics_dependency),
    db: Session = Depends(deps.get_db_session),
    current_user: AuthenticatedPrincipal = Depends(deps.get_current_user),
):
    """
    Predict delivery ETA with explainability
    
    Features:
    - Feature store lookup (with cache miss fallback)
    - SHAP-based explanations
    - OOD detection
    - Confidence scoring
    - Metrics recording
    
    Returns:
        Prediction with confidence, explanation, and metadata
    """
    start_time = time.time()
    
    try:
        if request.tenant_id != current_user.tenant_id:
            raise HTTPException(status_code=404, detail="Resource not found")

        feature_entity_id = f"{current_user.tenant_id}:{request.order_id}"

        # Step 1: Get features (from store or compute)
        features_dict = request.features
        
        if features_dict is None:
            # Try feature store first
            features_dict = feature_store.get_features(
                entity_id=feature_entity_id,
                version="v1",
                validate_freshness=True,
                max_age_hours=6
            )
        
        if features_dict is None:
            # Cache miss - compute features on the fly
            features_dict = _compute_features(request)
            
            # Store in feature store for future use
            background_tasks.add_task(
                feature_store.store_features,
                entity_id=feature_entity_id,
                features=features_dict,
                version="v1",
                ttl_hours=6
            )
        
        selected_model = model
        selected_model_version = model.version
        ab_route = _resolve_ab_test_routing(current_user.tenant_id, request.order_id)
        if ab_route is not None:
            selected_model_version = ab_route["model_version"]
            selected_model = _get_model_by_version(selected_model_version)

        # Convert to DataFrame
        X = pd.DataFrame([features_dict])
        
        # Align columns to model expectations if metadata is available
        feature_names = selected_model.get_metadata().get("feature_names")
        if feature_names:
            for name in feature_names:
                if name not in X.columns:
                    X[name] = 0.0
            X = X[feature_names]
        
        # Step 2: Make prediction with calibrated confidence and intervals
        prediction_bundle = selected_model.predict_with_intervals(X)
        p10_eta = float(prediction_bundle['p10'][0])
        p50_eta = float(prediction_bundle['p50'][0])
        p90_eta = float(prediction_bundle['p90'][0])
        confidence_score = float(prediction_bundle['confidence_within_5min'][0])
        predicted_eta = p50_eta

        prediction_object = selected_model.predict(X)
        is_ood = bool(prediction_object['is_ood'])

        # Step 5: Persist prediction provenance for A/B analysis
        feedback_row = DeliveryFeedback(
            tenant_id=current_user.tenant_id,
            order_id=request.order_id,
            prediction_model_version=selected_model_version,
            predicted_eta_min=predicted_eta,
            actual_delivery_min=None,
            predicted_at=datetime.utcnow(),
        )
        db.add(feedback_row)
        db.commit()
        
        # Step 6: Record metrics (background task)
        latency_ms = (time.time() - start_time) * 1000
        background_tasks.add_task(
            metrics.record_prediction,
            prediction_value=predicted_eta,
            latency_ms=latency_ms,
            is_ood=is_ood,
            confidence=confidence_score,
            metadata={
                'order_id': request.order_id,
                'tenant_id': current_user.tenant_id,
                'model_version': selected_model_version,
                'ab_test_id': ab_route['test_id'] if ab_route else None,
                'ab_group': ab_route['group'] if ab_route else None,
            }
        )
        
        # Step 7: Return response
        return ETAPredictionResponse(
            tenant_id=current_user.tenant_id,
            order_id=request.order_id,
            eta_minutes=float(prediction_object['eta_minutes']),
            eta_p10=float(prediction_object['eta_p10']),
            eta_p90=float(prediction_object['eta_p90']),
            interval_width_minutes=float(prediction_object['interval_width_minutes']),
            confidence_within_5min=float(prediction_object['confidence_within_5min']),
            is_ood=bool(prediction_object['is_ood']),
            top_features={k: float(v) for k, v in prediction_object['top_features'].items()},
            explanation=str(prediction_object['explanation']),
            model_version=selected_model_version,
            prediction_latency_ms=latency_ms,
            timestamp=datetime.utcnow().isoformat()
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@router.get("/model/info", response_model=ModelInfoResponse)
async def get_model_info(model: ETAPredictor = Depends(get_model)):
    """Get model metadata and statistics"""
    return ModelInfoResponse(
        model_name=model.model_name,
        version=model.version,
        status="loaded" if model.model else "not_loaded",
        metadata=model.get_metadata()
    )


@router.get("/model/feature_importance")
async def get_feature_importance(model: ETAPredictor = Depends(get_model)):
    """Get global feature importance"""
    try:
        importance = model.get_feature_importance()
        
        # Sort by importance
        sorted_importance = sorted(
            importance.items(),
            key=lambda x: x[1],
            reverse=True
        )
        
        return {
            "model_version": model.version,
            "feature_importance": dict(sorted_importance),
            "top_10_features": sorted_importance[:10]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/metrics/recent")
async def get_recent_metrics(
    window_size: int = 100,
    metrics = Depends(get_metrics_dependency)
):
    """Get recent prediction metrics"""
    stats = metrics.get_recent_stats(window_size=window_size)
    return stats


@router.post("/model/load")
async def load_model(model_path: str):
    """Load a trained model from disk"""
    global _model
    
    try:
        from pathlib import Path
        
        _model = ETAPredictor()
        _model.load(Path(model_path))
        
        return {
            "status": "success",
            "message": f"Model loaded from {model_path}",
            "model_version": _model.version
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load model: {str(e)}")


def _compute_features(request: ETAPredictionRequest) -> Dict[str, float]:
    """
    Compute features from raw request data
    
    This is a simplified version - in production, you'd have a dedicated
    feature engineering module with more sophisticated transformations
    """
    import math
    
    # Basic features
    features = {
        'distance_km': request.distance_km,
        'time_of_day_hour': float(request.time_of_day_hour),
        'day_of_week': float(request.day_of_week),
        'is_weekend': float(request.is_weekend),
        'is_peak_hour': float(request.is_peak_hour),
    }
    
    # Derived features
    features['distance_squared'] = request.distance_km ** 2
    features['is_morning_rush'] = float(7 <= request.time_of_day_hour <= 9)
    features['is_evening_rush'] = float(17 <= request.time_of_day_hour <= 19)
    
    # Categorical encodings (simple one-hot)
    traffic_map = {'low': 0, 'medium': 1, 'high': 2}
    features['traffic_level_encoded'] = float(traffic_map.get(request.traffic_level or 'medium', 1))
    
    vehicle_map = {'bike': 0, 'standard': 1, 'truck': 2}
    features['vehicle_type_encoded'] = float(vehicle_map.get(request.vehicle_type or 'standard', 1))
    
    weather_map = {'clear': 0, 'rain': 1, 'snow': 2, 'fog': 3}
    features['weather_encoded'] = float(weather_map.get(request.weather_condition or 'clear', 0))
    
    # Interaction features
    features['distance_x_traffic'] = features['distance_km'] * features['traffic_level_encoded']
    features['distance_x_peak'] = features['distance_km'] * features['is_peak_hour']
    
    return features


# Startup event handler (called when FastAPI app starts)
async def startup_ml_system():
    """Initialize ML system on startup"""
    global _model, _feature_store, _metrics_collector
    
    print("[ML System] Initializing...")
    
    # Initialize feature store
    _feature_store = get_feature_store()
    print("[ML System] Feature store initialized")
    
    # Initialize metrics collector
    _metrics_collector = get_metrics_collector()
    print("[ML System] Metrics collector initialized")
    
    # Try to load the latest model
    try:
        from pathlib import Path
        import json
        
        # Check for latest model version
        model_dir = Path("models")
        if model_dir.exists():
            version_file = model_dir / "latest_version.json"
            
            if version_file.exists():
                with open(version_file, "r") as f:
                    version_info = json.load(f)
                    latest_version = version_info.get("version")
                    if latest_version and not str(latest_version).startswith("v_"):
                        latest_version = f"v_{latest_version}"
                    model_path = model_dir / str(latest_version)
                    
                    if model_path.exists():
                        _model = ETAPredictor()
                        _model.load(model_path)
                        print(f"[ML System] Model loaded: {latest_version}")
                    else:
                        print(f"[ML System] Model path not found: {model_path}")
            else:
                print("[ML System] No latest_version.json found - train a model first")
        else:
            print("[ML System] Models directory not found")
    
    except Exception as e:
        print(f"[ML System] Failed to load model: {e}")
        print("[ML System] API will be available but predictions will fail until model is loaded")
    
    print("[ML System] Initialization complete")
