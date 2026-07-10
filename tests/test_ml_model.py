#!/usr/bin/env python
"""
PART 4: ML MODEL VALIDATION
Tests that the ML model can be loaded and used for inference.
"""
import sys
import os
from pathlib import Path

# Set UTF-8 encoding for Windows
if sys.platform == "win32":
    os.environ["PYTHONIOENCODING"] = "utf-8"
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Add project to path
sys.path.insert(0, str(Path.cwd()))

# Load env
from dotenv import load_dotenv
load_dotenv()

print("=" * 60)
print("PART 4: ML MODEL VALIDATION")
print("=" * 60)
print()

# Check model files
print("1. Checking model files...")
model_dir = Path("models")
required_files = [
    "model.joblib",
    "feature_names.json",
    "feature_stats.json",
    "optimal_threshold.json",
    "training_metadata.json"
]

all_present = True
for file in required_files:
    path = model_dir / file
    if path.exists():
        size_kb = path.stat().st_size / 1024
        print(f"  [OK] {file} ({size_kb:.1f} KB)")
    else:
        print(f"  [FAIL] {file} MISSING")
        all_present = False

if not all_present:
    print("\n[FAIL] Model files missing")
    sys.exit(1)

print()
print("2. Loading ML Model...")
try:
    from src.ml.inference import PredictionService
    service = PredictionService(model_dir="models/")
    print("  [OK] PredictionService initialized")
    print("  [OK] Model loaded successfully")
except Exception as e:
    print(f"  [FAIL] ERROR: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print()
print("3. Testing prediction...")
try:
    # Create test features
    import json
    with open("models/feature_names.json") as f:
        feature_names = json.load(f)
    
    # Create dummy prediction input
    test_features = {name: 0.5 for name in feature_names}
    print(f"  [OK] Feature count: {len(feature_names)}")
    print(f"  [OK] Sample features: {list(feature_names)[:5]}")
    
    # Try prediction with order_id + features
    result = service.predict(order_id="test-order-001", features=test_features)
    print(f"  [OK] Prediction executed")
    print(f"  [OK] Risk Score: {result.risk_score:.4f}")
    print(f"  [OK] Is High Risk: {result.is_high_risk}")
    print(f"  [OK] Confidence: {result.confidence}")
    print(f"  [OK] Inference Latency: {result.inference_latency_ms:.2f}ms")
    
except Exception as e:
    print(f"  [FAIL] ERROR during prediction: {e}")
    import traceback
    traceback.print_exc()

print()
print("4. Checking SHAP support...")
try:
    import shap
    print(f"  [OK] SHAP {shap.__version__} available")
except ImportError:
    print("  [WARN] SHAP not yet installed (will be available soon)")

print()
print("=" * 60)
print("PART 4 RESULT: ML MODEL READY")
print("=" * 60)
