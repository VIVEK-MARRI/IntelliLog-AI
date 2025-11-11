"""
src/api/app.py

Production-grade FastAPI backend for IntelliLog-AI.

Endpoints:
-----------
1. POST /predict_delivery_time
   → Predicts delivery time using trained XGBoost model.

2. POST /plan_routes
   → Plans optimized delivery routes using ML + DSA (VRP solver).

3. GET /metrics
   → Provides API performance and system health metrics.

Author: Vivek Yadav
Project: IntelliLog-AI
"""

import os
import sys
import time
import logging
import psutil
from datetime import datetime
import psutil
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional
import pandas as pd
import joblib

# Ensure src path is added
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from src.features.build_features import build_features
from src.optimization.vrp_solver import plan_routes

# -----------------------------------------------------------
# App Initialization
# -----------------------------------------------------------
app = FastAPI(
    title="IntelliLog-AI API",
    description="Intelligent Logistics & Delivery Optimization API combining ML + DSA",
    version="1.1.0"
)

# -----------------------------------------------------------
# Logging Configuration
# -----------------------------------------------------------
os.makedirs("logs", exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    handlers=[
        logging.FileHandler("logs/api.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("intellog-ai")

# Middleware to log request info
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = round(time.time() - start_time, 3)
    logger.info(f"{request.method} {request.url.path} → {response.status_code} ({process_time}s)")
    return response

# -----------------------------------------------------------
# Load trained model (only once at startup)
# -----------------------------------------------------------
MODEL_PATH = os.path.join("models", "xgb_delivery_time_model.pkl")

if os.path.exists(MODEL_PATH):
    model_data = joblib.load(MODEL_PATH)
    model = model_data["model"]
    features = model_data["features"]
    logger.info("✅ Model loaded successfully from disk.")
else:
    model, features = None, None
    logger.warning("⚠️ Model not found! Train model before using prediction endpoint.")

# -----------------------------------------------------------
# Request Models (Pydantic validation)
# -----------------------------------------------------------
class Order(BaseModel):
    order_id: str
    lat: float
    lon: float
    distance_km: float
    traffic: str
    weather: str
    order_type: str
    order_time: Optional[str] = None


class PredictRequest(BaseModel):
    orders: List[Order]


class RoutePlanRequest(BaseModel):
    orders: List[Order]
    drivers: int = 3
    method: str = "greedy"  # or 'ortools'

# -----------------------------------------------------------
# Utility: Prediction Function
# -----------------------------------------------------------
def predict_delivery_times(df: pd.DataFrame):
    """Predict delivery times using the trained ML model."""
    if model is None:
        logger.error("❌ Model not loaded.")
        raise HTTPException(status_code=500, detail="Model not loaded on server.")

    df, feat_list, target = build_features(df)
    preds = model.predict(df[features])
    logger.info(f"Predicted {len(preds)} delivery times successfully.")
    return preds.tolist()

# -----------------------------------------------------------
# API Endpoints
# -----------------------------------------------------------
@app.get("/")
async def root():
    return {
        "message": "🚀 IntelliLog-AI API is live!",
        "version": "1.1.0",
        "status": "running"
    }

@app.post("/predict_delivery_time")
async def predict_delivery_time(req: PredictRequest):
    """Predict delivery time for each given order."""
    try:
        df = pd.DataFrame([order.dict() for order in req.orders])
        preds = predict_delivery_times(df)
        df["predicted_delivery_time_min"] = preds
        logger.info(f"✅ Prediction successful for {len(df)} orders.")
        return df.to_dict(orient="records")
    except Exception as e:
        logger.exception("Prediction error")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/plan_routes")
async def plan_routes_endpoint(req: RoutePlanRequest):
    """Plan optimal delivery routes using ML + DSA algorithms."""
    try:
        df = pd.DataFrame([order.dict() for order in req.orders])

        def predictor(input_df: pd.DataFrame):
            return predict_delivery_times(input_df)

        result = plan_routes(
            orders=df.to_dict(orient="records"),
            drivers=req.drivers,
            method=req.method,
            model_predictor=predictor
        )
        logger.info(f"✅ Route optimization completed using {req.method} method.")
        return result
    except Exception as e:
        logger.exception("Route planning error")
        raise HTTPException(status_code=500, detail=str(e))

# -----------------------------------------------------------
# System Health & Metrics Endpoint
# -----------------------------------------------------------
@app.get("/metrics")
def get_metrics():
    """Return simple performance and health metrics."""
    try:
        cpu_usage = psutil.cpu_percent()
        mem_usage = psutil.virtual_memory().percent
        uptime = datetime.now().isoformat()

        logger.info(f"Metrics checked: CPU={cpu_usage}%, Memory={mem_usage}%")

        return {
            "status": "healthy",
            "timestamp": uptime,
            "cpu_usage": cpu_usage,
            "memory_usage": mem_usage,
            "model_loaded": model is not None,
            "active_features": len(features) if features else 0
        }
    except Exception as e:
        logger.exception("Metrics error")
        raise HTTPException(status_code=500, detail=str(e))
    

@app.get("/metrics")
async def get_metrics():
    """System + model health metrics for dashboard monitoring."""
    cpu = psutil.cpu_percent(interval=0.5)
    mem = psutil.virtual_memory().percent
    model_loaded = model is not None
    active_features = len(features) if features else 0
    return {
        "cpu_usage": cpu,
        "memory_usage": mem,
        "model_loaded": model_loaded,
        "active_features": active_features
    }


# -----------------------------------------------------------
# Run the API
# -----------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.api.app:app", host="0.0.0.0", port=8000, reload=True)
