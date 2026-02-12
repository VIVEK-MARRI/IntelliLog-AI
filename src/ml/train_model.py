import os
import sys
import pickle
import pandas as pd
import numpy as np
import xgboost as xgb
from datetime import datetime, timedelta
import logging

# Add project root to path
sys.path.append(os.getcwd())

from src.simulation.generators.order_generator import OrderGenerator
from src.simulation.generators.warehouse_scenarios import WarehouseScenarios

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def generate_training_data(n_samples=5000):
    logger.info(f"Generating {n_samples} synthetic training samples...")
    gen = OrderGenerator()
    scenario = WarehouseScenarios.get_scenario("hyderabad_central")
    warehouse = scenario["warehouses"][0]
    
    orders = gen.generate_orders(warehouse, n_samples, burst_mode=False)
    
    data = []
    for o in orders:
        # Create synthetic "actuals"
        # Base time + distance factor + traffic + random variance
        
        # dist approx: 1 deg lat = 111km
        lat1, lng1 = warehouse['lat'], warehouse['lng']
        lat2, lng2 = o['lat'], o['lng']
        dist_deg = np.sqrt((lat2-lat1)**2 + (lng2-lng1)**2)
        dist_km = dist_deg * 111.0
        
        # Features needed by ETA Service:
        # distance_km, weight, hour, day_of_week
        # traffic_factor (simulated)
        
        created_at = datetime.fromisoformat(o['created_at'])
        hour = created_at.hour
        day_of_week = created_at.weekday()
        
        # Traffic multiplier
        traffic_mult = 1.0
        if 8 <= hour <= 10 or 17 <= hour <= 19:
            traffic_mult = 1.5 # Rush hour
        
        # Base speed 30km/h -> 2 min/km
        base_duration_min = dist_km * 2.0 * traffic_mult
        
        # Add random variance (stop times, delays)
        actual_duration_min = base_duration_min + np.random.normal(5, 2)
        actual_duration_min = max(5, actual_duration_min)
        
        data.append({
            "distance_km": dist_km,
            "weight": o['weight'],
            "hour": hour,
            "day_of_week": day_of_week,
            "actual_duration_min": actual_duration_min
        })
        
    return pd.DataFrame(data)

def train_model():
    os.makedirs("models", exist_ok=True)
    
    df = generate_training_data(10000)
    
    logger.info("Training XGBoost Regressor...")
    
    X = df[["distance_km", "weight", "hour", "day_of_week"]]
    y = df["actual_duration_min"]
    
    model = xgb.XGBRegressor(
        objective='reg:squarederror',
        n_estimators=100,
        learning_rate=0.1,
        max_depth=5
    )
    
    model.fit(X, y)
    
    # Evaluate
    preds = model.predict(X)
    mae = np.mean(np.abs(preds - y))
    logger.info(f"Model Trained. MAE on training set: {mae:.2f} min")
    
    model_path = "models/xgb_delivery_time_model.pkl"
    with open(model_path, "wb") as f:
        pickle.dump(model, f)
    
    logger.info(f"Model saved to {model_path}")
    
    # Verify feature names match what ETA Service expects
    # ETA service currently extracts: distance_km, weight, hour, day_of_week
    # If the service logic is complex, we might need to update this script to match.
    # But for now, let's align the model to the *simplest* set of features.

if __name__ == "__main__":
    train_model()
