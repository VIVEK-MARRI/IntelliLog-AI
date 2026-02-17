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
                logger.warning("Falling back to heuristic ETA prediction")
        else:
            logger.warning(f"ETA model not found at {self.model_path}. Using fallback heuristic.")

    def predict_batch(self, df: pd.DataFrame) -> List[float]:
        """
        Predict ETAs for a batch of orders (DataFrame).
        
        Uses learned model if available, otherwise falls back to heuristic:
        ETA = 5 minutes + 2 minutes per km
        
        Args:
            df: DataFrame with at least 'distance_km' column
        
        Returns:
            List of predicted ETA minutes
        """
        if df.empty:
            return []
            
        # Use simple fallback if model is not loaded
        if not self.model:
            return self._predict_fallback(df)

        try:
            # Prepare features matching training data
            X = df.copy()
            
            # Ensure distance_km exists (vrp_solver usually adds it)
            if "distance_km" not in X.columns:
                X["distance_km"] = 5.0  # default fallback
            else:
                X["distance_km"] = pd.to_numeric(X["distance_km"], errors='coerce').fillna(5.0)
            
            # Ensure weight exists
            if "weight" not in X.columns:
                X["weight"] = 1.0
            else:
                X["weight"] = pd.to_numeric(X["weight"], errors='coerce').fillna(1.0)
                
            # Time features
            now = datetime.now()
            
            if "created_at" in X.columns:
                # Handle string conversion if necessary
                def parse_time(val):
                    if isinstance(val, str):
                        try:
                            return pd.to_datetime(val)
                        except:
                            pass
                    if isinstance(val, datetime):
                        return pd.Timestamp(val)
                    return pd.Timestamp(now)
                
                times = X["created_at"].apply(parse_time)
                X["hour"] = times.dt.hour
                X["day_of_week"] = times.dt.dayofweek
            else:
                X["hour"] = now.hour
                X["day_of_week"] = now.weekday()
            
            # Ensure all features are numeric and finite
            X["distance_km"] = X["distance_km"].clip(lower=0, upper=1000)  # Cap at 1000 km
            X["weight"] = X["weight"].clip(lower=0, upper=10000)
            X["hour"] = X["hour"].astype(int)
            X["day_of_week"] = X["day_of_week"].astype(int)
            
            # Select exact columns for model
            features = X[["distance_km", "weight", "hour", "day_of_week"]]
            
            # Ensure no NaN values
            features = features.fillna(0)
            
            preds = self.model.predict(features)
            
            # Sanity checks on predictions
            predictions = []
            for pred in preds:
                # Clip to reasonable range: 1 minute to 24 hours
                clipped_pred = max(1.0, min(float(pred), 1440.0))
                predictions.append(clipped_pred)
            
            return predictions

        except Exception as e:
            logger.error(f"Batch prediction failed: {e}. Using fallback.")
            return self._predict_fallback(df)

    def _predict_fallback(self, df: pd.DataFrame) -> List[float]:
        """
        Fallback heuristic: 5 min + 2 min per km.
        Safe and realistic for most deliveries.
        """
        dists = df["distance_km"] if "distance_km" in df.columns else np.zeros(len(df))
        dists = pd.to_numeric(dists, errors='coerce').fillna(5.0)
        
        # Heuristic: assume 30 km/h average speed
        # 5 min base + (distance_km / 30) * 60
        predictions = (5.0 + (dists / 30.0) * 60.0).tolist()
        
        # Sanity check: clip to 1 min - 24 hours
        predictions = [max(1.0, min(p, 1440.0)) for p in predictions]
        
        return predictions

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
