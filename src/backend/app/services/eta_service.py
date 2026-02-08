import logging
import joblib
import pandas as pd
import numpy as np
import os
from datetime import datetime
from typing import List, Dict, Any
from src.backend.app.core.config import settings

logger = logging.getLogger(__name__)


class ETAService:
    """Production-grade ETA prediction service with enhanced features."""
    
    _model = None

    @classmethod
    def load_model(cls):
        """Load the trained XGBoost model."""
        if cls._model is None:
            if os.path.exists(settings.MODEL_PATH):
                logger.info(f"Loading production model from {settings.MODEL_PATH}")
                cls._model = joblib.load(settings.MODEL_PATH)
            else:
                logger.warning(f"Model not found at {settings.MODEL_PATH}. Using fallback predictor.")
                cls._model = "FALLBACK"
        return cls._model

    @classmethod
    def engineer_features(cls, orders: List[Dict[str, Any]]) -> pd.DataFrame:
        """
        Apply production feature engineering to raw order data.
        
        Generates 38 features matching the training pipeline.
        """
        df = pd.DataFrame(orders)
        
        # Ensure required base columns with defaults
        if 'distance_km' not in df.columns:
            df['distance_km'] = 10.0
        if 'weight' not in df.columns:
            df['weight'] = 5.0
        if 'order_time' not in df.columns:
            df['order_time'] = pd.Timestamp.now()
        if 'traffic' not in df.columns:
            df['traffic'] = 'medium'
        if 'weather' not in df.columns:
            df['weather'] = 'clear'
        if 'order_type' not in df.columns:
            df['order_type'] = 'normal'
        
        # Parse datetime
        df['order_time'] = pd.to_datetime(df['order_time'], errors='coerce').fillna(pd.Timestamp.now())
        
        # === TEMPORAL FEATURES ===
        df['hour'] = df['order_time'].dt.hour
        df['day_of_week'] = df['order_time'].dt.dayofweek
        df['day_of_month'] = df['order_time'].dt.day
        df['month'] = df['order_time'].dt.month
        df['quarter'] = df['order_time'].dt.quarter
        df['is_weekend'] = (df['day_of_week'] >= 5).astype(int)
        df['is_rush_hour'] = ((df['hour'] >= 7) & (df['hour'] <= 9) | 
                              (df['hour'] >= 16) & (df['hour'] <= 19)).astype(int)
        df['is_lunch_hour'] = ((df['hour'] >= 11) & (df['hour'] <= 14)).astype(int)
        df['is_night'] = ((df['hour'] >= 22) | (df['hour'] <= 6)).astype(int)
        df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24)
        df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24)
        df['dow_sin'] = np.sin(2 * np.pi * df['day_of_week'] / 7)
        df['dow_cos'] = np.cos(2 * np.pi * df['day_of_week'] / 7)
        
        # === GEOGRAPHIC FEATURES ===
        df['distance_log'] = np.log1p(df['distance_km'])
        df['distance_squared'] = df['distance_km'] ** 2
        df['dist_cat_enc'] = pd.cut(df['distance_km'], 
                                     bins=[0, 5, 15, 30, 100], 
                                     labels=[0, 1, 2, 3]).astype(int)
        df['num_turns'] = np.maximum(1, (df['distance_km'] / 2).astype(int))
        df['highway_percentage'] = np.clip(df['distance_km'] / 50, 0, 1)
        df['urban_percentage'] = 1 - df['highway_percentage']
        
        # === OPERATIONAL FEATURES ===
        df['weight_log'] = np.log1p(df['weight'])
        df['weight_cat_enc'] = pd.cut(df['weight'], 
                                       bins=[0, 2, 5, 10, 100], 
                                       labels=[0, 1, 2, 3]).astype(int)
        df['order_type_enc'] = df['order_type'].map({
            'normal': 0, 'express': 1, 'same_day': 2
        }).fillna(0).astype(int)
        df['is_express'] = (df['order_type'] == 'express').astype(int)
        df['is_same_day'] = (df['order_type'] == 'same_day').astype(int)
        
        # === TRAFFIC & WEATHER FEATURES ===
        df['traffic_enc'] = df['traffic'].map({
            'low': 0, 'medium': 1, 'high': 2
        }).fillna(1).astype(int)
        df['traffic_multiplier'] = 1 + (df['traffic_enc'] * 0.3)
        df['weather_enc'] = df['weather'].map({
            'clear': 0, 'rain': 1, 'snow': 2, 'storm': 3
        }).fillna(0).astype(int)
        df['is_bad_weather'] = (df['weather_enc'] >= 2).astype(int)
        
        # === INTERACTION FEATURES ===
        df['dist_x_traffic'] = df['distance_km'] * df['traffic_multiplier']
        df['dist_x_weather'] = df['distance_km'] * (1 + df['weather_enc'] * 0.15)
        df['dist_x_rush_hour'] = df['distance_km'] * (1 + df['is_rush_hour'] * 0.25)
        df['dist_x_weekend'] = df['distance_km'] * (1 - df['is_weekend'] * 0.1)
        df['traffic_x_weather'] = df['traffic_enc'] * df['weather_enc']
        df['traffic_x_rush'] = df['traffic_enc'] * df['is_rush_hour']
        df['weight_x_dist'] = df['weight_log'] * df['distance_log']
        df['express_x_dist'] = df['is_express'] * df['distance_km']
        
        return df

    @classmethod
    def predict_eta(cls, features: List[Dict[str, Any]]) -> List[float]:
        """
        Predict delivery time (minutes) for orders using production model.
        
        Args:
            features: List of order dictionaries with at minimum:
                - distance_km: float
                - Optional: weight, traffic, weather, order_type, order_time
        
        Returns:
            List of predicted delivery times in minutes
        """
        model = cls.load_model()
        
        # Engineer features
        df = cls.engineer_features(features)
        
        # Feature list (must match training)
        feature_cols = [
            'hour', 'day_of_week', 'day_of_month', 'month', 'quarter',
            'is_weekend', 'is_rush_hour', 'is_lunch_hour', 'is_night',
            'hour_sin', 'hour_cos', 'dow_sin', 'dow_cos',
            'distance_km', 'distance_log', 'distance_squared',
            'dist_cat_enc', 'num_turns', 'highway_percentage', 'urban_percentage',
            'weight', 'weight_log', 'weight_cat_enc',
            'order_type_enc', 'is_express', 'is_same_day',
            'traffic_enc', 'traffic_multiplier', 'weather_enc', 'is_bad_weather',
            'dist_x_traffic', 'dist_x_weather', 'dist_x_rush_hour', 'dist_x_weekend',
            'traffic_x_weather', 'traffic_x_rush', 'weight_x_dist', 'express_x_dist'
        ]
        
        # Fallback if model not loaded
        if model == "FALLBACK":
            logger.warning("Using fallback heuristic for ETA prediction")
            return (df['distance_km'] * 2.0).tolist()
        
        try:
            # Prepare feature matrix
            X = df[feature_cols]
            
            # Predict
            predictions = model.predict(X)
            
            # Ensure positive predictions
            predictions = np.maximum(predictions, 1.0)
            
            return predictions.tolist()
            
        except Exception as e:
            logger.error(f"Prediction failed: {e}. Using fallback heuristic.")
            return (df['distance_km'] * 2.0).tolist()
