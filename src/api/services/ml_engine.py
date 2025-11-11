# src/api/services/ml_engine.py
"""
ML Engine Service for IntelliLog-AI

Responsibilities:
- Load/save the XGBoost model artifact (joblib)
- Provide batched prediction with minimal preprocessing contract
- Provide SHAP explainability (if SHAP installed)
- Simple in-memory TTL cache for repeated requests

Notes:
- The service expects a model artifact saved as joblib with dict keys:
    {"model": <sklearn/xgboost model>, "features": <list_of_feature_names>}
- build_features(df) is used to create model-ready features (imported from src.features)
"""

import os
import time
import hashlib
import logging
from typing import List, Dict, Any, Optional

import joblib
import pandas as pd

# optional dependencies
try:
    import shap  # type: ignore
    _HAS_SHAP = True
except Exception:
    _HAS_SHAP = False

from cachetools import TTLCache, cached
from src.features.build_features import build_features  # ensures same FE pipeline

logger = logging.getLogger("intellog-ai.ml_engine")

MODEL_PATH_DEFAULT = os.path.join("models", "xgb_delivery_time_model.pkl")

# small in-memory cache: maxsize 256 entries, 10 minute TTL
_PRED_CACHE = TTLCache(maxsize=256, ttl=600)


def _df_hash(df: pd.DataFrame) -> str:
    """Create a stable hash for a DataFrame (based on values + columns)."""
    # Use pandas utilities to avoid order issues
    values = pd.util.hash_pandas_object(df, index=True).values.tobytes()
    h = hashlib.sha256()
    h.update(df.columns.to_string().encode("utf-8"))
    h.update(values)
    return h.hexdigest()


class ModelEngine:
    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path or MODEL_PATH_DEFAULT
        self.model = None
        self.features = []
        self._load_model()

        # prepare SHAP explainer placeholder (lazy init)
        self._shap_explainer = None

    def _load_model(self):
        if not os.path.exists(self.model_path):
            logger.warning("Model file not found: %s", self.model_path)
            return

        try:
            model_data = joblib.load(self.model_path)
            self.model = model_data.get("model")
            self.features = model_data.get("features", []) or []
            logger.info("ModelEngine: model loaded from %s", self.model_path)
        except Exception as e:
            logger.exception("ModelEngine: failed to load model: %s", e)
            self.model = None
            self.features = []

    def is_ready(self) -> bool:
        return self.model is not None and len(self.features) > 0

    def reload(self):
        """Reload model from disk (useful after retraining)."""
        logger.info("ModelEngine: reloading model from disk...")
        self._load_model()
        # reset shap explainer so it will be re-created
        self._shap_explainer = None

    @cached(_PRED_CACHE)
    def _predict_cached(self, df_hash: str, df_payload: bytes) -> List[float]:
        """Internal cached wrapper. Signature chosen to be hashable for cachetools."""
        # df_payload is ignored because we re-create features from hash origin in public predict()
        raise RuntimeError("_predict_cached should not be called directly")

    def predict(self, df: pd.DataFrame) -> List[float]:
        """
        Predict delivery times for a DataFrame of orders.
        - Runs feature engineering via build_features()
        - Uses model to predict on the saved feature list order
        - Uses simple caching keyed by dataframe hash
        """

        if not self.is_ready():
            raise RuntimeError("ModelEngine: model not loaded or features missing.")

        # ensure a copy
        df = df.copy()
        # build features (returns transformed df, feat_list, target if any)
        df_transformed, feat_list, target = build_features(df)

        # check that required features exist in transformed df
        missing = [f for f in self.features if f not in df_transformed.columns]
        if missing:
            logger.warning("ModelEngine.predict: missing features %s", missing)
            # attempt to fill missing features with zeros
            for f in missing:
                df_transformed[f] = 0.0

        # reorder columns to model's feature order
        X = df_transformed[self.features]

        # create cache key from X values
        df_h = _df_hash(X)
        payload_bytes = X.to_numpy().tobytes()

        # use TTLCache directly (cachetools cached decorator requires fixed signature)
        cache_key = df_h
        if cache_key in _PRED_CACHE:
            logger.info("ModelEngine.predict: cache hit")
            return _PRED_CACHE[cache_key]

        # run prediction
        t0 = time.time()
        preds = self.model.predict(X)
        elapsed = time.time() - t0
        preds_list = [float(p) for p in preds]
        _PRED_CACHE[cache_key] = preds_list
        logger.info("ModelEngine.predict: predicted %d rows in %.3fs", len(preds_list), elapsed)
        return preds_list

    def explain(self, df: pd.DataFrame, nsamples: int = 100) -> Dict[str, Any]:
        """
        Compute SHAP values for the provided dataframe.
        Returns a dict with:
            - base_value
            - feature_names
            - shap_values (list of lists matching rows)
        """
        if not _HAS_SHAP:
            raise RuntimeError("SHAP is not installed. Install `shap` to enable explainability.")

        if not self.is_ready():
            raise RuntimeError("ModelEngine: model not loaded or features missing.")

        # feature engineering
        df_transformed, feat_list, target = build_features(df)
        X = df_transformed[self.features]

        # lazy init of explainer for tree models
        if self._shap_explainer is None:
            try:
                # for tree-based models, TreeExplainer is best
                self._shap_explainer = shap.TreeExplainer(self.model)
            except Exception:
                # fallback to KernelExplainer (slower)
                logger.warning("ModelEngine.explain: TreeExplainer failed, falling back to KernelExplainer.")
                background = X.sample(min(len(X), 50), random_state=0)
                self._shap_explainer = shap.KernelExplainer(self.model.predict, background)

        # compute SHAP (limit nsamples to size)
        try:
            shap_vals = self._shap_explainer.shap_values(X, nsamples=min(nsamples, X.shape[0]))
        except Exception:
            # older shap versions use different call signatures
            shap_vals = self._shap_explainer.shap_values(X)

        # shap_vals shape handling: convert to nested lists
        shap_list = [list(map(float, row)) for row in (shap_vals if hasattr(shap_vals, "__iter__") else shap_vals.tolist())]

        return {
            "base_value": float(self._shap_explainer.expected_value if hasattr(self._shap_explainer, "expected_value") else 0.0),
            "feature_names": list(X.columns),
            "shap_values": shap_list
        }
