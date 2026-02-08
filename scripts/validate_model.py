"""
ML Model Validation Script

Validates the production model's performance, predictions, and edge cases.
"""

import sys
import os
import joblib
import pandas as pd
import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

from src.backend.app.services.eta_service import ETAService


def validate_model():
    """Comprehensive model validation."""
    print("=" * 70)
    print("ML Model Validation Report")
    print("=" * 70)
    print()
    
    # 1. Check model file
    model_path = 'models/xgb_delivery_time_model.pkl'
    if not os.path.exists(model_path):
        print("❌ ERROR: Model file not found!")
        return False
    
    print(f"✓ Model file exists: {model_path}")
    print(f"  Size: {os.path.getsize(model_path) / 1024:.2f} KB")
    print()
    
    # 2. Load model
    try:
        model = joblib.load(model_path)
        print(f"✓ Model loaded successfully")
        print(f"  Type: {type(model).__name__}")
        print()
    except Exception as e:
        print(f"❌ ERROR loading model: {e}")
        return False
    
    # 3. Test predictions with various scenarios
    print("Testing Predictions:")
    print("-" * 70)
    
    test_cases = [
        {
            "name": "Short distance, clear weather",
            "distance_km": 5.0,
            "weight": 2.0,
            "traffic": "low",
            "weather": "clear",
            "order_type": "normal"
        },
        {
            "name": "Medium distance, rush hour",
            "distance_km": 15.0,
            "weight": 5.0,
            "traffic": "high",
            "weather": "clear",
            "order_type": "express"
        },
        {
            "name": "Long distance, bad weather",
            "distance_km": 30.0,
            "weight": 10.0,
            "traffic": "medium",
            "weather": "rain",
            "order_type": "normal"
        },
        {
            "name": "Express delivery, heavy package",
            "distance_km": 20.0,
            "weight": 15.0,
            "traffic": "high",
            "weather": "storm",
            "order_type": "express"
        },
    ]
    
    all_predictions_valid = True
    for i, test_case in enumerate(test_cases, 1):
        try:
            prediction = ETAService.predict_eta([test_case])
            eta = prediction[0]
            
            # Validate prediction
            is_valid = 1.0 <= eta <= 300.0  # Between 1 min and 5 hours
            status = "✓" if is_valid else "❌"
            
            print(f"{status} Test {i}: {test_case['name']}")
            print(f"   Distance: {test_case['distance_km']} km, Weight: {test_case['weight']} kg")
            print(f"   Traffic: {test_case['traffic']}, Weather: {test_case['weather']}")
            print(f"   Predicted ETA: {eta:.2f} minutes")
            
            if not is_valid:
                print(f"   ⚠️  WARNING: Prediction outside valid range!")
                all_predictions_valid = False
            print()
            
        except Exception as e:
            print(f"❌ Test {i} FAILED: {e}")
            all_predictions_valid = False
            print()
    
    # 4. Edge case testing
    print("Edge Case Testing:")
    print("-" * 70)
    
    edge_cases = [
        {"name": "Minimum distance", "distance_km": 0.5, "weight": 0.5, "traffic": "low", "weather": "clear", "order_type": "normal"},
        {"name": "Maximum distance", "distance_km": 100.0, "weight": 50.0, "traffic": "high", "weather": "storm", "order_type": "express"},
        {"name": "Zero weight", "distance_km": 10.0, "weight": 0.1, "traffic": "medium", "weather": "clear", "order_type": "normal"},
    ]
    
    edge_cases_passed = True
    for edge_case in edge_cases:
        try:
            prediction = ETAService.predict_eta([edge_case])
            eta = prediction[0]
            is_valid = eta > 0
            status = "✓" if is_valid else "❌"
            print(f"{status} {edge_case['name']}: {eta:.2f} min")
            if not is_valid:
                edge_cases_passed = False
        except Exception as e:
            print(f"❌ {edge_case['name']}: FAILED - {e}")
            edge_cases_passed = False
    
    print()
    
    # 5. Performance validation
    print("Performance Validation:")
    print("-" * 70)
    
    # Load training metrics
    metrics_file = 'models/v_20260205_001854/metrics.json'
    if os.path.exists(metrics_file):
        import json
        with open(metrics_file, 'r') as f:
            metrics = json.load(f)
        
        xgb_metrics = metrics.get('xgboost', {})
        print(f"✓ Training Metrics:")
        print(f"   Validation MAE:  {xgb_metrics.get('val_mae', 'N/A'):.3f} minutes")
        print(f"   Validation RMSE: {xgb_metrics.get('val_rmse', 'N/A'):.3f} minutes")
        print(f"   Validation R²:   {xgb_metrics.get('val_r2', 'N/A'):.4f}")
        
        # Check if metrics meet production standards
        val_mae = xgb_metrics.get('val_mae', float('inf'))
        val_r2 = xgb_metrics.get('val_r2', 0)
        
        mae_ok = val_mae < 2.0  # MAE should be < 2 minutes
        r2_ok = val_r2 > 0.95   # R² should be > 95%
        
        print()
        print(f"{'✓' if mae_ok else '❌'} MAE < 2.0 minutes: {mae_ok}")
        print(f"{'✓' if r2_ok else '❌'} R² > 0.95: {r2_ok}")
    else:
        print("⚠️  Metrics file not found")
        mae_ok = r2_ok = False
    
    print()
    
    # 6. Final verdict
    print("=" * 70)
    print("FINAL VERDICT:")
    print("=" * 70)
    
    all_checks_passed = all_predictions_valid and edge_cases_passed and mae_ok and r2_ok
    
    if all_checks_passed:
        print("✅ MODEL IS PRODUCTION-READY")
        print()
        print("Summary:")
        print("  ✓ Model file exists and loads correctly")
        print("  ✓ All test predictions are valid")
        print("  ✓ Edge cases handled properly")
        print("  ✓ Performance metrics meet production standards")
        print()
        print("Status: APPROVED FOR PRODUCTION DEPLOYMENT")
    else:
        print("⚠️  MODEL NEEDS ATTENTION")
        print()
        print("Issues found:")
        if not all_predictions_valid:
            print("  - Some predictions outside valid range")
        if not edge_cases_passed:
            print("  - Edge case handling needs improvement")
        if not mae_ok:
            print("  - MAE exceeds 2.0 minute threshold")
        if not r2_ok:
            print("  - R² below 95% threshold")
        print()
        print("Status: REQUIRES IMPROVEMENT")
    
    print("=" * 70)
    return all_checks_passed


if __name__ == "__main__":
    success = validate_model()
    sys.exit(0 if success else 1)
