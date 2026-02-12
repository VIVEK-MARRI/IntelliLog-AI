import logging
import pickle
import os
import pandas as pd
import numpy as np
from datetime import datetime
from typing import List, Dict, Any, Optional, Union

logger = logging.getLogger(__name__)

# Global singleton instance
_eta_service_instance = None

def get_eta_service():
    global _eta_service_instance
    if _eta_service_instance is None:
        _eta_service_instance = ETAService()
    return _eta_service_instance

class ETAService:
    def __init__(self, model_path: str = "models/xgb_delivery_time_model.pkl"):
        self.model_path = model_path
        self.model = None
        self._load_model()

    def _load_model(self):
        if os.path.exists(self.model_path):
            try:
                with open(self.model_path, "rb") as f:
                    self.model = pickle.load(f)
                logger.info(f"Loaded ETA model from {self.model_path}")
            except Exception as e:
                logger.error(f"Failed to load ETA model: {e}")
        else:
            logger.warning(f"ETA model not found at {self.model_path}. Using fallback heuristic.")

    def predict_batch(self, df: pd.DataFrame) -> List[float]:
        """
        Predict ETAs for a batch of orders (DataFrame).
        Matches the signature expected by vrp_solver.py's model_predictor.
        """
        if df.empty:
            return []
            
        # Use simple fallback if model is not loaded
        if not self.model:
            # Fallback: 5 min + 2 min/km
            dists = df["distance_km"] if "distance_km" in df.columns else np.zeros(len(df))
            return (5.0 + dists * 2.0).tolist()

        try:
            # Prepare features matching training data
            # Features: distance_km, weight, hour, day_of_week
            
            X = df.copy()
            
            # Ensure distance_km exists (vrp_solver usually adds it)
            if "distance_km" not in X.columns:
                X["distance_km"] = 5.0 # default dummy
            
            # Ensure weight exists
            if "weight" not in X.columns:
                X["weight"] = 1.0
            else:
                X["weight"] = X["weight"].fillna(1.0)
                
            # Time features
            # If 'created_at' exists, use it. Otherwise use now.
            now = datetime.now()
            
            if "created_at" in X.columns:
                # Handle string conversion if necessary
                def parse_time(val):
                    if isinstance(val, str):
                        try:
                            return datetime.fromisoformat(val)
                        except:
                            pass
                    if isinstance(val, datetime):
                        return val
                    return now
                
                times = X["created_at"].apply(parse_time)
                X["hour"] = times.dt.hour
                X["day_of_week"] = times.dt.dayofweek
            else:
                X["hour"] = now.hour
                X["day_of_week"] = now.weekday()
                
            # Select exact columns for model
            features = X[["distance_km", "weight", "hour", "day_of_week"]]
            
            preds = self.model.predict(features)
            return preds.tolist()

        except Exception as e:
            logger.error(f"Batch prediction failed: {e}. Using fallback.")
            # Fallback
            dists = df["distance_km"] if "distance_km" in df.columns else np.zeros(len(df))
            return (5.0 + dists * 2.0).tolist()

    @staticmethod
    def predict_eta(df: pd.DataFrame) -> List[float]:
        """Static accessor for OptimizationService."""
        return get_eta_service().predict_batch(df)

    # Legacy method support if needed elsewhere
    def predict_delivery_time(self, distance_km: float, weight: float, created_at: Optional[datetime] = None) -> float:
        """Single prediction (helper)."""
        if created_at is None:
            created_at = datetime.now()
        
        df = pd.DataFrame([{
            "distance_km": distance_km,
            "weight": weight,
            "created_at": created_at
        }])
        
        preds = self.predict_batch(df)
        return preds[0] if preds else 5.0
