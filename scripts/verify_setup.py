"""
System Verification Script
Run this after setup to verify all components are working
"""

import sys
from pathlib import Path


def check_python_version():
    """Check Python version is 3.10+"""
    print("✓ Checking Python version...")
    version = sys.version_info
    if version.major >= 3 and version.minor >= 10:
        print(f"  ✅ Python {version.major}.{version.minor}.{version.micro}")
        return True
    else:
        print(f"  ❌ Python {version.major}.{version.minor} (need 3.10+)")
        return False


def check_dependencies():
    """Check critical dependencies are installed"""
    print("\n✓ Checking dependencies...")
    
    deps = {
        'pandas': 'pandas',
        'numpy': 'numpy',
        'xgboost': 'xgboost',
        'fastapi': 'fastapi',
        'redis': 'redis',
        'sqlalchemy': 'sqlalchemy',
        'pydantic': 'pydantic',
        'shap': 'shap',
        'prometheus_client': 'prometheus-client'
    }
    
    all_ok = True
    for module, package in deps.items():
        try:
            __import__(module)
            print(f"  ✅ {package}")
        except ImportError:
            print(f"  ❌ {package} (run: pip install {package})")
            all_ok = False
    
    return all_ok


def check_ml_structure():
    """Check ML directory structure exists"""
    print("\n✓ Checking ML directory structure...")
    
    dirs = [
        'src/ml',
        'src/ml/models',
        'src/ml/features',
        'src/ml/monitoring',
        'models'
    ]
    
    all_ok = True
    for dir_path in dirs:
        path = Path(dir_path)
        if path.exists():
            print(f"  ✅ {dir_path}/")
        else:
            print(f"  ❌ {dir_path}/ (missing)")
            all_ok = False
    
    return all_ok


def check_ml_files():
    """Check ML implementation files exist"""
    print("\n✓ Checking ML implementation files...")
    
    files = [
        'src/ml/models/base_model.py',
        'src/ml/models/eta_predictor.py',
        'src/ml/features/store.py',
        'src/ml/monitoring/metrics.py',
        'src/backend/app/api/api_v1/endpoints/predictions.py',
        'scripts/train_quick_start.py'
    ]
    
    all_ok = True
    for file_path in files:
        path = Path(file_path)
        if path.exists():
            print(f"  ✅ {file_path}")
        else:
            print(f"  ❌ {file_path} (missing)")
            all_ok = False
    
    return all_ok


def check_env_file():
    """Check .env file exists"""
    print("\n✓ Checking configuration...")
    
    env_file = Path(".env")
    env_example = Path(".env.example")
    
    if env_file.exists():
        print(f"  ✅ .env file exists")
        return True
    elif env_example.exists():
        print(f"  ⚠️  .env not found (copy from .env.example)")
        return False
    else:
        print(f"  ❌ .env.example not found")
        return False


def check_trained_model():
    """Check if a trained model exists"""
    print("\n✓ Checking for trained model...")
    
    models_dir = Path("models")
    latest_version = models_dir / "latest_version.json"
    
    if not models_dir.exists():
        print(f"  ❌ models/ directory not found")
        return False
    
    if latest_version.exists():
        print(f"  ✅ Trained model found (latest_version.json)")
        return True
    else:
        print(f"  ⚠️  No trained model (run: python scripts/train_quick_start.py)")
        return False


def test_feature_store():
    """Test feature store connection"""
    print("\n✓ Testing Feature Store (Redis)...")
    
    try:
        from src.ml.features.store import FeatureStore
        
        # Try to connect
        store = FeatureStore(redis_url="redis://localhost:6379/0")
        
        # Test write/read
        test_features = {"test_feature": 1.0}
        store.store_features("test_entity", test_features, version="test")
        retrieved = store.get_features("test_entity", version="test", validate_freshness=False)
        
        # Cleanup
        store.delete_features("test_entity", version="test")
        
        if retrieved and retrieved.get("test_feature") == 1.0:
            print(f"  ✅ Feature Store connected and working")
            return True
        else:
            print(f"  ❌ Feature Store read/write failed")
            return False
    
    except Exception as e:
        print(f"  ❌ Feature Store error: {e}")
        print(f"     (Make sure Redis is running: docker-compose up -d redis)")
        return False


def test_model_loading():
    """Test model class can be instantiated"""
    print("\n✓ Testing Model Loading...")
    
    try:
        from src.ml.models.eta_predictor import ETAPredictor
        
        model = ETAPredictor()
        print(f"  ✅ ETAPredictor initialized: {model}")
        return True
    
    except Exception as e:
        print(f"  ❌ Model loading error: {e}")
        return False


def main():
    """Run all verification checks"""
    print("="*70)
    print("IntelliLog-AI System Verification")
    print("="*70)
    print()
    
    results = []
    
    results.append(("Python Version", check_python_version()))
    results.append(("Dependencies", check_dependencies()))
    results.append(("ML Structure", check_ml_structure()))
    results.append(("ML Files", check_ml_files()))
    results.append(("Configuration", check_env_file()))
    results.append(("Trained Model", check_trained_model()))
    results.append(("Feature Store", test_feature_store()))
    results.append(("Model Loading", test_model_loading()))
    
    print()
    print("="*70)
    print("Verification Summary")
    print("="*70)
    print()
    
    passed = sum(1 for _, ok in results if ok)
    total = len(results)
    
    for name, ok in results:
        status = "✅ PASS" if ok else "❌ FAIL"
        print(f"  {status:10s} {name}")
    
    print()
    print(f"Result: {passed}/{total} checks passed")
    print()
    
    if passed == total:
        print("🎉 All systems operational!")
        print()
        print("Next steps:")
        print("  1. Train a model: python scripts/train_quick_start.py")
        print("  2. Start API: uvicorn src.backend.app.main:app --reload")
        print("  3. Test prediction: curl http://localhost:8000/api/v1/ml/predict/eta")
        return 0
    else:
        print("⚠️  Some checks failed. Review errors above and:")
        print("  1. Run bootstrap script: ./scripts/dev_bootstrap.sh")
        print("  2. Install missing dependencies: pip install -r requirements.txt")
        print("  3. Start Redis: docker-compose up -d redis")
        print("  4. Train model: python scripts/train_quick_start.py")
        return 1


if __name__ == "__main__":
    sys.exit(main())
