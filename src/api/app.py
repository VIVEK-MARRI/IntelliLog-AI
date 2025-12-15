"""
src/api/app.py

🚀 IntelliLog-AI API v3.2 — ML + Optimization + XAI + Live Tracking

A production-grade FastAPI backend powering:
- XGBoost-based delivery time prediction (ML)
- OR-Tools / Greedy VRP route optimization (DSA)
- SHAP explainability for model insights (XAI)
- Real-time live tracking simulator (API-driven)
- System health monitoring (metrics)

Author: Vivek Marri
Project: IntelliLog-AI
Version: 3.2.0
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


# -----------------------------------------------------------
# PATH & IMPORTS
# -----------------------------------------------------------
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from src.optimization.vrp_solver import plan_routes
from src.api.services.ml_engine import ModelEngine
from src.api.live_tracking import router as live_tracking_router  # Live tracking module
# -----------------------------------------------------------
# ROUTERS
# -----------------------------------------------------------
from src.api.routes.health import router as health_router
from src.api.live_tracking import router as live_tracking_router

# -----------------------------------------------------------
# CONFIGURATION
# -----------------------------------------------------------
MODEL_PATH = os.path.join("models", "xgb_delivery_time_model.pkl")

# -----------------------------------------------------------
# INITIALIZE ML ENGINE
# -----------------------------------------------------------
ML_ENGINE = ModelEngine(MODEL_PATH)

# -----------------------------------------------------------
# FASTAPI APP INITIALIZATION
# -----------------------------------------------------------
app = FastAPI(
    title="IntelliLog-AI API",
    description=(
        "A unified AI backend for Delivery Time Prediction, "
        "Route Optimization, Explainability, and Live Tracking."
    ),
    version="3.2.0",
)
# -----------------------------------------------------------
# ROUTERS
# -----------------------------------------------------------
app.include_router(health_router)
app.include_router(live_tracking_router)

# -----------------------------------------------------------
# CORS CONFIGURATION
# -----------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------
# LOGGING CONFIGURATION
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
# MIDDLEWARE: Request Timing
# -----------------------------------------------------------
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = round(time.time() - start_time, 3)
    logger.info(f"{request.method} {request.url.path} → {response.status_code} ({process_time}s)")
    return response

# -----------------------------------------------------------
# PYDANTIC MODELS
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
# ROOT ENDPOINT
# -----------------------------------------------------------
@app.get("/", summary="API Root")
async def root():
    return {
        "message": "🚀 IntelliLog-AI API is running successfully",
        "version": "3.2.0",
        "status": "online",
        "available_endpoints": [
            "/predict_delivery_time",
            "/predict_explain",
            "/plan_routes",
            "/live_tracking",
            "/metrics",
        ],
    }

# -----------------------------------------------------------
# DELIVERY TIME PREDICTION ENDPOINT
# -----------------------------------------------------------
@app.post("/predict_delivery_time", summary="Predict Delivery Time using XGBoost")
async def predict_delivery_time(req: PredictRequest):
    try:
        if not ML_ENGINE.is_ready():
            raise HTTPException(status_code=500, detail="Model not loaded on server.")

        df = pd.DataFrame([order.dict() for order in req.orders])

        logger.info(f"Received {len(df)} orders for prediction.")
        logger.info(f"Features: {', '.join(map(str, df.columns))}")

        preds = ML_ENGINE.predict(df)
        df["predicted_delivery_time_min"] = preds

        logger.info(f"✅ Prediction successful for {len(df)} records.")
        return df.to_dict(orient="records")

    except Exception as e:
        logger.exception("❌ Prediction API error:")
        raise HTTPException(status_code=500, detail=str(e))

# -----------------------------------------------------------
# EXPLAINABILITY (SHAP) ENDPOINT
# -----------------------------------------------------------
@app.post("/predict_explain", summary="Explain Predictions via SHAP")
async def predict_explain(req: PredictRequest, nsamples: int = 100):
    """
    Returns SHAP feature importance and prediction contributions for each order.
    """
    try:
        if not ML_ENGINE.is_ready():
            raise HTTPException(status_code=500, detail="Model not loaded on server.")

        df = pd.DataFrame([order.dict() for order in req.orders])

        logger.info(f"Running SHAP explainability for {len(df)} samples...")

        preds = ML_ENGINE.predict(df)
        explanation = ML_ENGINE.explain(df, nsamples=nsamples)

        logger.info("✅ SHAP explanation generated successfully.")
        return {"predictions": preds, "explanation": explanation}

    except Exception as e:
        logger.exception("❌ Explainability API error:")
        raise HTTPException(status_code=500, detail=str(e))

# -----------------------------------------------------------
# ROUTE OPTIMIZATION ENDPOINT
# -----------------------------------------------------------
@app.post("/plan_routes", summary="Plan Optimized Routes (Greedy / OR-Tools)")
async def plan_routes_endpoint(req: RoutePlanRequest):
    try:
        if not ML_ENGINE.is_ready():
            raise HTTPException(status_code=500, detail="Model not loaded on server.")

        df = pd.DataFrame([order.dict() for order in req.orders])

        logger.info(f"Planning {len(df)} routes using method={req.method}, drivers={req.drivers}.")

        def predictor(input_df: pd.DataFrame):
            return ML_ENGINE.predict(input_df)

        result = plan_routes(
            orders=df.to_dict(orient="records"),
            drivers=req.drivers,
            method=req.method,
            model_predictor=predictor,
        )

        logger.info("✅ Route optimization completed.")
        return result

    except Exception as e:
        logger.exception("❌ Route planning error:")
        raise HTTPException(status_code=500, detail=str(e))

# -----------------------------------------------------------
# REGISTER LIVE TRACKING ROUTER
# -----------------------------------------------------------
app.include_router(live_tracking_router)

# -----------------------------------------------------------
# SYSTEM HEALTH & METRICS
# -----------------------------------------------------------
@app.get("/metrics", summary="System & Model Health Metrics")
async def get_metrics():
    try:
        cpu_usage = psutil.cpu_percent(interval=0.5)
        mem_usage = psutil.virtual_memory().percent
        uptime = datetime.now().isoformat()

        metrics = {
            "status": "healthy",
            "timestamp": uptime,
            "cpu_usage": cpu_usage,
            "memory_usage": mem_usage,
            "model_loaded": ML_ENGINE.is_ready(),
            "cached_predictions": getattr(ML_ENGINE, "_PRED_CACHE", None),
        }

        logger.info(f"Metrics snapshot: CPU={cpu_usage}%, MEM={mem_usage}%")
        return metrics

    except Exception as e:
        logger.exception("❌ Metrics retrieval failed:")
        raise HTTPException(status_code=500, detail=str(e))

# -----------------------------------------------------------
# MAIN ENTRY POINT
# -----------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.api.app:app", host="0.0.0.0", port=8000, reload=True)
