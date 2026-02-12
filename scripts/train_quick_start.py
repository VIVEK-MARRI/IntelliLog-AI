"""
Quick Start ML Training Script
Train the ETA prediction model on sample data
"""

import pandas as pd
import numpy as np
from pathlib import Path
import json
from datetime import datetime
from sklearn.model_selection import train_test_split

from src.ml.models.eta_predictor import ETAPredictor


def generate_synthetic_training_data(n_samples: int = 1000) -> pd.DataFrame:
    """
    Generate synthetic delivery data for training
    
    In production, replace this with your actual historical delivery data
    """
    np.random.seed(42)
    
    data = {
        # Distance features
        'distance_km': np.random.uniform(1, 50, n_samples),
        
        # Time features
        'time_of_day_hour': np.random.randint(6, 22, n_samples),
        'day_of_week': np.random.randint(0, 7, n_samples),
        
        # Traffic and conditions
        'traffic_level_encoded': np.random.choice([0, 1, 2], n_samples, p=[0.3, 0.5, 0.2]),
        'weather_encoded': np.random.choice([0, 1, 2], n_samples, p=[0.7, 0.2, 0.1]),
        'vehicle_type_encoded': np.random.choice([0, 1, 2], n_samples, p=[0.2, 0.6, 0.2]),
    }
    
    # Boolean features
    data['is_weekend'] = (data['day_of_week'] >= 5).astype(float)
    data['is_peak_hour'] = np.logical_or(
        (data['time_of_day_hour'] >= 7) & (data['time_of_day_hour'] <= 9),
        (data['time_of_day_hour'] >= 17) & (data['time_of_day_hour'] <= 19)
    ).astype(float)
    data['is_morning_rush'] = ((data['time_of_day_hour'] >= 7) & (data['time_of_day_hour'] <= 9)).astype(float)
    data['is_evening_rush'] = ((data['time_of_day_hour'] >= 17) & (data['time_of_day_hour'] <= 19)).astype(float)
    
    # Derived features
    data['distance_squared'] = data['distance_km'] ** 2
    data['distance_x_traffic'] = data['distance_km'] * data['traffic_level_encoded']
    data['distance_x_peak'] = data['distance_km'] * data['is_peak_hour']
    
    df = pd.DataFrame(data)
    
    # Generate realistic target variable (ETA in minutes)
    # Base ETA: ~2 minutes per km
    base_eta = df['distance_km'] * 2
    
    # Add traffic effect
    traffic_multiplier = 1 + (df['traffic_level_encoded'] * 0.3)
    
    # Add peak hour effect
    peak_multiplier = 1 + (df['is_peak_hour'] * 0.4)
    
    # Add weather effect
    weather_multiplier = 1 + (df['weather_encoded'] * 0.15)
    
    # Add vehicle type effect
    vehicle_effect = df['vehicle_type_encoded'].map({0: 0.8, 1: 1.0, 2: 1.3})
    
    # Calculate final ETA with random noise
    eta = base_eta * traffic_multiplier * peak_multiplier * weather_multiplier * vehicle_effect
    eta += np.random.normal(0, 2, n_samples)  # Add noise
    eta = np.maximum(eta, 1)  # Minimum 1 minute
    
    df['eta_minutes'] = eta
    
    return df


def main():
    """Main training workflow"""
    print("="*70)
    print("IntelliLog-AI: Quick Start Model Training")
    print("="*70)
    print()
    
    # Step 1: Load or generate data
    print("[1/7] Loading training data...")
    
    # Try to load real data if available
    data_path = Path("data/processed/training_data_enhanced.csv")
    
    if data_path.exists():
        print(f"    Loading data from {data_path}")
        df = pd.read_csv(data_path)
        print(f"    Loaded {len(df)} samples from file")
    else:
        print("    No training data found. Generating synthetic data...")
        df = generate_synthetic_training_data(n_samples=5000)
        print(f"    Generated {len(df)} synthetic samples")
        
        # Save synthetic data
        data_path.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(data_path, index=False)
        print(f"    Saved synthetic data to {data_path}")
    
    print()
    
    # Step 2: Prepare features and target
    print("[2/7] Preparing features...")
    
    # Define feature columns (exclude target)
    feature_cols = [col for col in df.columns if col != 'eta_minutes']
    
    X = df[feature_cols]
    y = df['eta_minutes']
    
    print(f"    Features: {len(feature_cols)} columns")
    print(f"    Target: eta_minutes")
    print()
    
    # Step 3: Train/val split
    print("[3/7] Splitting data (80/20)...")
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    
    print(f"    Train: {len(X_train)} samples")
    print(f"    Val: {len(X_val)} samples")
    print()
    
    # Step 4: Initialize model
    print("[4/7] Initializing XGBoost model...")
    model = ETAPredictor(
        model_name="eta_predictor",
        xgb_params={
            'objective': 'reg:squarederror',
            'max_depth': 6,
            'learning_rate': 0.05,
            'n_estimators': 300,
            'subsample': 0.8,
            'colsample_bytree': 0.8,
            'min_child_weight': 3,
            'gamma': 0.1,
            'reg_alpha': 0.1,
            'reg_lambda': 1.0,
            'random_state': 42,
            'n_jobs': -1,
            'tree_method': 'hist',
            'early_stopping_rounds': 30
        }
    )
    print("    Model initialized")
    print()
    
    # Step 5: Train
    print("[5/7] Training model (this may take 1-2 minutes)...")
    print("-" * 70)
    
    metrics = model.train(
        X_train=X_train,
        y_train=y_train,
        X_val=X_val,
        y_val=y_val,
        verbose=50
    )
    
    print("-" * 70)
    print()
    print("Training Complete!")
    print()
    print("Metrics:")
    print(f"  Train MAE:  {metrics['train_mae']:.2f} minutes")
    print(f"  Train RMSE: {metrics['train_rmse']:.2f} minutes")
    print(f"  Train R²:   {metrics['train_r2']:.4f}")
    print()
    print(f"  Val MAE:    {metrics['val_mae']:.2f} minutes")
    print(f"  Val RMSE:   {metrics['val_rmse']:.2f} minutes")
    print(f"  Val R²:     {metrics['val_r2']:.4f}")
    print()
    print(f"  Training time: {metrics['training_time_seconds']:.1f} seconds")
    print()
    
    # Step 6: Save model
    print("[6/7] Saving model...")
    
    model_dir = Path("models")
    model_dir.mkdir(exist_ok=True)
    
    # Create version directory
    version_dir = model_dir / model.version
    model.save(version_dir)
    
    print(f"    Saved to: {version_dir}")
    
    # Update latest version pointer
    latest_version_file = model_dir / "latest_version.json"
    latest_info = {
        'version': model.version,
        'path': str(version_dir),
        'created_at': datetime.utcnow().isoformat(),
        'metrics': metrics
    }
    
    with open(latest_version_file, 'w') as f:
        json.dump(latest_info, f, indent=2)
    
    print(f"    Updated latest version: {latest_version_file}")
    print()
    
    # Step 7: Feature importance
    print("[7/7] Feature Importance (Top 10):")
    print("-" * 70)
    
    importance = model.get_feature_importance()
    sorted_importance = sorted(importance.items(), key=lambda x: x[1], reverse=True)
    
    for i, (feature, imp) in enumerate(sorted_importance[:10], 1):
        print(f"  {i:2d}. {feature:30s} {imp:.4f}")
    
    print("-" * 70)
    print()
    
    # Success summary
    print("="*70)
    print("✅ Model Training Complete!")
    print("="*70)
    print()
    print("What's next?")
    print()
    print("1. Start the API server:")
    print("   uvicorn src.backend.app.main:app --reload --host 0.0.0.0 --port 8000")
    print()
    print("2. Test predictions:")
    print("   curl -X POST http://localhost:8000/api/v1/ml/predict/eta \\")
    print("     -H 'Content-Type: application/json' \\")
    print("     -d '{...}'")
    print()
    print("3. View API docs:")
    print("   http://localhost:8000/api/v1/docs")
    print()
    print("4. Check model info:")
    print("   http://localhost:8000/api/v1/ml/model/info")
    print()
    
    return model, metrics


if __name__ == "__main__":
    model, metrics = main()
