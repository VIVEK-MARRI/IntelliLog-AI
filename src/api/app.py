"""
src/api/app.py

Production-grade FastAPI backend for IntelliLog-AI.

Endpoints:
-----------
1. POST /predict_delivery_time
   → Predicts delivery time using trained XGBoost model.

2. POST /plan_routes
   → Plans optimized delivery routes using ML + DSA (VRP solver).

Author: Vivek Yadav
Project: IntelliLog-AI
"""

import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import pandas as pd
import joblib

from src.features.build_features import build_features
from src.optimization.vrp_solver import plan_routes

app = FastAPI(
    title="IntelliLog-AI API",
    description="Intelligent Logistics & Delivery Optimization API combining ML + DSA",
    version="1.0.0"
)

# -----------------------------------------------------------
# Load trained model (only once at startup)
# -----------------------------------------------------------
MODEL_PATH = os.path.join("models", "xgb_delivery_time_model.pkl")

if os.path.exists(MODEL_PATH):
    model_data = joblib.load(MODEL_PATH)
    model = model_data["model"]
    features = model_data["features"]
else:
    model, features = None, None
    print(" Warning: Model not found. Train model before using prediction endpoint.")


# -----------------------------------------------------------
# Request Models (for FastAPI validation)
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
    """Use trained model to predict delivery times for given dataframe."""
    if model is None:
        raise HTTPException(status_code=500, detail="Model not loaded on server.")

    df, feat_list, target = build_features(df)
    preds = model.predict(df[features])
    return preds.tolist()


# -----------------------------------------------------------
# API Routes
# -----------------------------------------------------------

@app.get("/")
async def root():
    return {"message": " IntelliLog-AI API is running", "version": "1.0.0"}


@app.post("/predict_delivery_time")
async def predict_delivery_time(req: PredictRequest):
    """Predict delivery time for each given order."""
    try:
        df = pd.DataFrame([order.dict() for order in req.orders])
        preds = predict_delivery_times(df)
        df["predicted_delivery_time_min"] = preds
        return df.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/plan_routes")
async def plan_routes_endpoint(req: RoutePlanRequest):
    """Plan optimal delivery routes using ML + DSA algorithms."""
    try:
        df = pd.DataFrame([order.dict() for order in req.orders])

        # attach ML predictor
        def predictor(input_df: pd.DataFrame):
            return predict_delivery_times(input_df)

        result = plan_routes(
            orders=df.to_dict(orient="records"),
            drivers=req.drivers,
            method=req.method,
            model_predictor=predictor
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -----------------------------------------------------------
# Run with: uvicorn src.api.app:app --reload
# -----------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.api.app:app", host="0.0.0.0", port=8000, reload=True)
