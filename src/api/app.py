"""
src/api/app.py

Production-grade FastAPI backend for IntelliLog-AI v3.1

Endpoints:
-----------
1. POST /predict_delivery_time
   → Predicts delivery time using trained XGBoost model (ModelEngine).

2. POST /predict_explain
   → Returns SHAP explainability data for given orders.

3. POST /plan_routes
   → Plans optimized delivery routes using ML + DSA (VRP solver).

4. GET /live_tracking
   → Provides simulated live GPS tracking updates for drivers.

5. GET /metrics
   → Provides API performance and system health metrics.

Author: Vivek Marri
Project: IntelliLog-AI
Version: 3.1.0
"""

import os
import sys
import time
import logging
from datetime import datetime
from typing import List, Optional

import psutil
import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

# Ensure src path is added for imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

# Local imports
from src.optimization.vrp_solver import plan_routes
from src.api.services.ml_engine import ModelEngine
from src.api.live_tracking import router as live_tracking_router  # 🚀 New import

# -----------------------------------------------------------
# Configuration
# -----------------------------------------------------------
MODEL_PATH = os.path.join("models", "xgb_delivery_time_model.pkl")

# -----------------------------------------------------------
# Initialize ML Engine
# -----------------------------------------------------------
ML_ENGINE = ModelEngine(MODEL_PATH)

# -----------------------------------------------------------
# App Initialization
# -----------------------------------------------------------
app = FastAPI(
    title="IntelliLog-AI API",
    description="AI-based Delivery Time Prediction, Route Optimization & Live Tracking (ML + OR-Tools + XAI)",
    version="3.1.0",
)

# -----------------------------------------------------------
# CORS Setup
# -----------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production: replace with your Streamlit domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------
# Logging Configuration
# -----------------------------------------------------------
os.makedirs("logs", exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    handlers=[
        logging.FileHandler("logs/api.log", encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("intellog-ai")

# -----------------------------------------------------------
# Middleware for request timing and logging
# -----------------------------------------------------------
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = round(time.time() - start_time, 3)
    logger.info(f"{request.method} {request.url.path} -> {response.status_code} ({process_time}s)")
    return response

# -----------------------------------------------------------
# Pydantic Request Models
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
    method: str = "greedy"  # or "ortools"

# -----------------------------------------------------------
# Root Endpoint
# -----------------------------------------------------------
@app.get("/", summary="API Root")
async def root():
    return {
        "message": "🚀 IntelliLog-AI API is running successfully",
        "version": "3.1.0",
        "status": "online",
        "endpoints": [
            "/predict_delivery_time",
            "/predict_explain",
            "/plan_routes",
            "/live_tracking",
            "/metrics",
        ],
    }

# -----------------------------------------------------------
# Prediction Endpoint
# -----------------------------------------------------------
@app.post("/predict_delivery_time", summary="Predict Delivery Time")
async def predict_delivery_time(req: PredictRequest):
    try:
        if not ML_ENGINE.is_ready():
            raise HTTPException(status_code=500, detail="Model not loaded on server.")

        df = pd.DataFrame([order.dict() for order in req.orders])
        preds = ML_ENGINE.predict(df)
        df["predicted_delivery_time_min"] = preds

        logger.info(f"✅ Prediction successful for {len(df)} orders.")
        return df.to_dict(orient="records")
    except Exception as e:
        logger.exception("Prediction API error:")
        raise HTTPException(status_code=500, detail=str(e))

# -----------------------------------------------------------
# Explainability Endpoint (SHAP)
# -----------------------------------------------------------
@app.post("/predict_explain", summary="Explain Predictions (SHAP)")
async def predict_explain(req: PredictRequest, nsamples: int = 100):
    """
    Returns SHAP-based feature contributions for each prediction.
    """
    try:
        if not ML_ENGINE.is_ready():
            raise HTTPException(status_code=500, detail="Model not loaded on server.")

        df = pd.DataFrame([order.dict() for order in req.orders])
        preds = ML_ENGINE.predict(df)
        explanation = ML_ENGINE.explain(df, nsamples=nsamples)
        logger.info("✅ SHAP explanation generated successfully.")
        return {"predictions": preds, "explanation": explanation}
    except Exception as e:
        logger.exception("Explainability API error:")
        raise HTTPException(status_code=500, detail=str(e))

# -----------------------------------------------------------
# Route Optimization Endpoint
# -----------------------------------------------------------
@app.post("/plan_routes", summary="Plan Optimized Routes")
async def plan_routes_endpoint(req: RoutePlanRequest):
    try:
        if not ML_ENGINE.is_ready():
            raise HTTPException(status_code=500, detail="Model not loaded on server.")

        df = pd.DataFrame([order.dict() for order in req.orders])

        def predictor(input_df: pd.DataFrame):
            return ML_ENGINE.predict(input_df)

        result = plan_routes(
            orders=df.to_dict(orient="records"),
            drivers=req.drivers,
            method=req.method,
            model_predictor=predictor,
        )
        logger.info(f"✅ Route optimization completed using method={req.method}.")
        return result
    except Exception as e:
        logger.exception("Route planning error:")
        raise HTTPException(status_code=500, detail=str(e))

# -----------------------------------------------------------
# Register Live Tracking Router
# -----------------------------------------------------------
app.include_router(live_tracking_router)

# -----------------------------------------------------------
# Metrics & Health Endpoint
# -----------------------------------------------------------
@app.get("/metrics", summary="System & Model Health Metrics")
async def get_metrics():
    try:
        cpu_usage = psutil.cpu_percent(interval=0.5)
        mem_usage = psutil.virtual_memory().percent
        uptime = datetime.now().isoformat()

        return {
            "status": "healthy",
            "timestamp": uptime,
            "cpu_usage": cpu_usage,
            "memory_usage": mem_usage,
            "model_loaded": ML_ENGINE.is_ready(),
            "cached_predictions": getattr(ML_ENGINE, "_PRED_CACHE", None),
        }
    except Exception as e:
        logger.exception("Metrics retrieval failed:")
        raise HTTPException(status_code=500, detail=str(e))

# -----------------------------------------------------------
# Run Server (Development)
# -----------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.api.app:app", host="0.0.0.0", port=8000, reload=True)
