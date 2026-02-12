"""
ML Prediction API Endpoints
Production-ready ETA predictions with explainability and monitoring
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List
import pandas as pd
import time
from datetime import datetime

from src.ml.models.eta_predictor import ETAPredictor
from src.ml.features.store import get_feature_store
from src.ml.monitoring.metrics import get_metrics_collector

router = APIRouter()

# Global model instance (loaded on startup)
_model: Optional[ETAPredictor] = None
_feature_store = None
_metrics_collector = None


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
    order_id: str
    predicted_eta_minutes: float
    confidence_score: float = Field(..., ge=0, le=1)
    is_out_of_distribution: bool
    explanation: Optional[Dict[str, Any]] = None
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
    metrics = Depends(get_metrics_dependency)
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
        # Step 1: Get features (from store or compute)
        features_dict = request.features
        
        if features_dict is None:
            # Try feature store first
            features_dict = feature_store.get_features(
                entity_id=request.order_id,
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
                entity_id=request.order_id,
                features=features_dict,
                version="v1",
                ttl_hours=6
            )
        
        # Convert to DataFrame
        X = pd.DataFrame([features_dict])
        
        # Align columns to model expectations if metadata is available
        feature_names = model.get_metadata().get("feature_names")
        if feature_names:
            for name in feature_names:
                if name not in X.columns:
                    X[name] = 0.0
            X = X[feature_names]
        
        # Step 2: Detect OOD samples
        is_ood = not model.detect_ood(X)[0]
        
        # Step 3: Make prediction
        prediction, confidence = model.predict_with_confidence(X)
        predicted_eta = float(prediction[0])
        confidence_score = float(confidence[0])
        
        # Step 4: Generate explanation (if not OOD)
        explanation = None
        if not is_ood:
            try:
                explanation = model.explain(X, sample_idx=0)
            except Exception as e:
                # Explanation failed - log but don't fail request
                print(f"Explanation generation failed: {e}")
        
        # Step 5: Record metrics (background task)
        latency_ms = (time.time() - start_time) * 1000
        background_tasks.add_task(
            metrics.record_prediction,
            prediction_value=predicted_eta,
            latency_ms=latency_ms,
            is_ood=is_ood,
            confidence=confidence_score,
            metadata={'order_id': request.order_id}
        )
        
        # Step 6: Return response
        return ETAPredictionResponse(
            order_id=request.order_id,
            predicted_eta_minutes=predicted_eta,
            confidence_score=confidence_score,
            is_out_of_distribution=is_ood,
            explanation=explanation,
            model_version=model.version,
            prediction_latency_ms=latency_ms,
            timestamp=datetime.utcnow().isoformat()
        )
    
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
