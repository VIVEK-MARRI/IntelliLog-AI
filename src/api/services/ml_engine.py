# src/api/services/ml_engine.py
"""
🚀 IntelliLog-AI — ML Engine Service (v3.2)

Responsibilities:
-----------------
- Load and manage trained XGBoost model artifact (joblib format)
- Predict delivery times using consistent feature engineering pipeline
- Provide SHAP explainability (TreeExplainer / KernelExplainer fallback)
- Maintain in-memory TTL cache for repeated inference requests

Expected model artifact structure (joblib):
{
    "model": <XGBoost or sklearn model>,
    "features": <list_of_feature_names>
}

Author: Vivek Marri
Project: IntelliLog-AI
Version: 3.2.0
"""

import os
import time
import hashlib
import logging
from typing import List, Dict, Any, Optional

import joblib
import pandas as pd
from cachetools import TTLCache

# Optional dependencies
try:
    import shap  # type: ignore
    _HAS_SHAP = True
except Exception:
    _HAS_SHAP = False

# Local imports
from src.features.build_features import build_features  # ensures same feature pipeline

# -----------------------------------------------------------
# CONFIGURATION
# -----------------------------------------------------------
logger = logging.getLogger("intellog-ai.ml_engine")
MODEL_PATH_DEFAULT = os.path.join("models", "xgb_delivery_time_model.pkl")

# TTL cache: 256 entries, 10-minute expiration
_PRED_CACHE = TTLCache(maxsize=256, ttl=600)


# -----------------------------------------------------------
# UTILITIES
# -----------------------------------------------------------
def _df_hash(df: pd.DataFrame) -> str:
    """
    Create a stable hash for a DataFrame based on values and columns.
    """
    try:
        h = hashlib.sha256()
        h.update(",".join(map(str, df.columns)).encode("utf-8"))
        h.update(pd.util.hash_pandas_object(df, index=True).values.tobytes())
        return h.hexdigest()
    except Exception as e:
        logger.warning(f"⚠️ Hashing failed: {e}")
        return str(time.time())  # fallback


# -----------------------------------------------------------
# MODEL ENGINE
# -----------------------------------------------------------
class ModelEngine:
    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path or MODEL_PATH_DEFAULT
        self.model = None
        self.features: List[str] = []
        self._shap_explainer = None
        self._load_model()

    # -------------------------------------------------------
    # LOAD / RELOAD MODEL
    # -------------------------------------------------------
    def _load_model(self):
        if not os.path.exists(self.model_path):
            logger.warning(f"⚠️ Model file not found: {self.model_path}")
            return

        try:
            model_data = joblib.load(self.model_path)
            self.model = model_data.get("model")
            self.features = model_data.get("features", [])
            logger.info(f"✅ Model loaded successfully from {self.model_path}")
        except Exception as e:
            logger.exception(f"❌ Failed to load model: {e}")
            self.model = None
            self.features = []

    def reload(self):
        """Reload model from disk (useful after retraining)."""
        logger.info("🔁 Reloading model from disk...")
        self._load_model()
        self._shap_explainer = None

    def is_ready(self) -> bool:
        return self.model is not None and len(self.features) > 0

    # -------------------------------------------------------
    # PREDICTION
    # -------------------------------------------------------
    def predict(self, df: pd.DataFrame) -> List[float]:
        """
        Predict delivery times for a DataFrame of orders.

        - Builds features via build_features()
        - Reorders columns to model’s feature list
        - Uses TTL cache for deduped requests
        """
        if not self.is_ready():
            raise RuntimeError("ModelEngine: model not loaded or features missing.")

        if df.empty:
            logger.warning("⚠️ Empty dataframe passed to predict(). Returning [].")
            return []

        df = df.copy()
        df_transformed, feat_list, _ = build_features(df)

        # Fill missing model features
        for f in self.features:
            if f not in df_transformed.columns:
                df_transformed[f] = 0.0

        # Align feature order
        X = df_transformed[self.features]

        # Cache key
        cache_key = _df_hash(X)
        if cache_key in _PRED_CACHE:
            logger.info("⚡ Cache hit for prediction request.")
            return _PRED_CACHE[cache_key]

        # Run model prediction
        t0 = time.time()
        preds = self.model.predict(X)
        elapsed = time.time() - t0

        preds_list = [float(p) for p in preds]
        _PRED_CACHE[cache_key] = preds_list

        logger.info(f"✅ Predicted {len(preds_list)} rows in {elapsed:.3f}s")
        return preds_list

    # -------------------------------------------------------
    # EXPLAINABILITY (SHAP)
    # -------------------------------------------------------
    def explain(self, df: pd.DataFrame, nsamples: int = 100) -> Dict[str, Any]:
        """
        Compute SHAP values for the provided dataframe.
        Returns:
            - base_value
            - feature_names
            - shap_values (nested list)
        """
        if not _HAS_SHAP:
            raise RuntimeError("SHAP is not installed. Run: pip install shap")

        if not self.is_ready():
            raise RuntimeError("ModelEngine: model not loaded or features missing.")

        if df.empty:
            logger.warning("⚠️ Empty dataframe passed to explain(). Returning empty result.")
            return {"shap_values": [], "feature_names": [], "base_value": 0.0}

        # Feature engineering
        df_transformed, _, _ = build_features(df)
        X = df_transformed[self.features]

        # Lazy initialize SHAP explainer
        if self._shap_explainer is None:
            try:
                self._shap_explainer = shap.TreeExplainer(self.model)
                logger.info("🧠 SHAP TreeExplainer initialized.")
            except Exception:
                logger.warning("⚠️ TreeExplainer failed, using KernelExplainer (slower).")
                background = X.sample(min(len(X), 50), random_state=0)
                self._shap_explainer = shap.KernelExplainer(self.model.predict, background)

        # Compute SHAP values
        try:
            shap_vals = self._shap_explainer.shap_values(X, nsamples=min(nsamples, len(X)))
        except Exception:
            shap_vals = self._shap_explainer.shap_values(X)

        # Convert to list of lists for JSON response
        shap_array = (
            shap_vals.tolist()
            if hasattr(shap_vals, "tolist")
            else [list(map(float, row)) for row in shap_vals]
        )

        return {
            "base_value": float(
                getattr(self._shap_explainer, "expected_value", 0.0)
                if hasattr(self._shap_explainer, "expected_value")
                else 0.0
            ),
            "feature_names": list(X.columns),
            "shap_values": shap_array,
        }
