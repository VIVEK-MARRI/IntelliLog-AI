"""
Production inference service for IntelliLog-AI delay prediction.

Loads trained model and makes low-latency predictions with SHAP explainability.
"""

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import shap
import xgboost as xgb

from src.ml.feature_engineering import FeatureBuilder, FeatureStats


@dataclass
class PredictionResult:
    """Result of a delay prediction."""
    
    order_id: str
    risk_score: float  # Probability of delay (0.0-1.0)
    is_high_risk: bool  # True if risk_score > optimal_threshold
    confidence: str  # "high", "medium", or "low"
    top_risk_factors: list[dict]  # [{"feature": str, "contribution": float, ...}]
    predicted_delay_minutes: float  # Estimated delay if high risk, else 0
    model_version: str
    inference_latency_ms: float


class PredictionService:
    """
    Production inference service for delay prediction.
    
    Loads model artifacts and makes predictions with:
    - Input validation
    - Feature building
    - SHAP explainability
    - Latency tracking
    """
    
    def __init__(self, model_dir: str = "models/"):
        """
        Initialize inference service from trained model artifacts.
        
        Args:
            model_dir: Directory containing trained model artifacts
            
        Raises:
            FileNotFoundError: If any artifact is missing
            ValueError: If artifacts are corrupted
        """
        self.model_dir = Path(model_dir)
        
        print(f"Loading model from {self.model_dir}...")
        
        # Load model
        model_path = self.model_dir / "model.joblib"
        if not model_path.exists():
            raise FileNotFoundError(f"Model not found: {model_path}")
        self.model = joblib.load(model_path)
        print("  [OK] Model loaded")
        
        # Load feature names
        feature_names_path = self.model_dir / "feature_names.json"
        if not feature_names_path.exists():
            raise FileNotFoundError(f"Feature names not found: {feature_names_path}")
        with open(feature_names_path) as f:
            self.feature_names = json.load(f)
        print(f"  [OK] Feature names loaded ({len(self.feature_names)} features)")
        
        # Load optimal threshold
        threshold_path = self.model_dir / "optimal_threshold.json"
        if not threshold_path.exists():
            raise FileNotFoundError(f"Threshold config not found: {threshold_path}")
        with open(threshold_path) as f:
            threshold_config = json.load(f)
        self.optimal_threshold = threshold_config["threshold"]
        print(f"  [OK] Optimal threshold loaded: {self.optimal_threshold:.4f}")
        
        # Load feature stats (for imputation)
        stats_path = self.model_dir / "feature_stats.json"
        if not stats_path.exists():
            raise FileNotFoundError(f"Feature stats not found: {stats_path}")
        with open(stats_path) as f:
            stats_dict = json.load(f)
        self.feature_stats = FeatureStats(
            feature_medians=stats_dict["feature_medians"],
            feature_mins=stats_dict["feature_mins"],
            feature_maxs=stats_dict["feature_maxs"],
        )
        print("  [OK] Feature statistics loaded")
        
        # Load metadata
        metadata_path = self.model_dir / "training_metadata.json"
        if not metadata_path.exists():
            raise FileNotFoundError(f"Metadata not found: {metadata_path}")
        with open(metadata_path) as f:
            self.metadata = json.load(f)
        self.model_version = self.metadata.get("training_date", "unknown")
        print("  [OK] Training metadata loaded")
        
        # Initialize feature builder
        self.feature_builder = FeatureBuilder(feature_stats=self.feature_stats)
        
        # SHAP explainer (lazy-loaded on first use)
        self._explainer = None
    
    def _get_explainer(self) -> shap.TreeExplainer:
        """Lazy-load SHAP explainer."""
        if self._explainer is None:
            print("Initializing SHAP explainer...")
            self._explainer = shap.TreeExplainer(self.model)
        return self._explainer
    
    def predict(
        self,
        order_id: str,
        features: dict[str, float],
    ) -> PredictionResult:
        """
        Make delay prediction for an order.
        
        Args:
            order_id: Order identifier
            features: Feature dict from FeatureBuilder.build_from_live()
                     or build_from_historical()
        
        Returns:
            PredictionResult with risk score and explanation
            
        Raises:
            ValueError: If features are invalid
        """
        start_time = time.time()
        
        # ===== Validate Input =====
        try:
            self.feature_builder.validate_features(features)
        except ValueError as e:
            raise ValueError(f"Invalid features for order {order_id}: {e}")
        
        # ===== Impute Missing Features =====
        features = self.feature_builder.impute_features(features, self.feature_stats)
        
        # ===== Build Feature Vector =====
        X = np.array([[features[name] for name in self.feature_names]])
        
        # ===== Prediction =====
        y_pred_proba = self.model.predict_proba(X)[:, 1]
        risk_score = float(y_pred_proba[0])
        
        # ===== Decision =====
        is_high_risk = risk_score > self.optimal_threshold
        
        # ===== Confidence =====
        confidence_dist = abs(risk_score - 0.5)
        if confidence_dist > 0.3:
            confidence = "high"
        elif confidence_dist > 0.15:
            confidence = "medium"
        else:
            confidence = "low"
        
        # ===== Predicted Delay =====
        # Risk-proportional estimate: scales from 0 min at threshold to 60 min at risk=1.0.
        # This is an approximation until a dedicated regression model is trained.
        if is_high_risk:
            excess = risk_score - self.optimal_threshold
            range_ = max(1.0 - self.optimal_threshold, 1e-6)
            predicted_delay = round((excess / range_) * 60.0, 1)
        else:
            predicted_delay = 0.0
        
        latency_ms = (time.time() - start_time) * 1000
        
        # ===== No SHAP in base predict (for speed) =====
        top_risk_factors = []
        
        result = PredictionResult(
            order_id=order_id,
            risk_score=risk_score,
            is_high_risk=is_high_risk,
            confidence=confidence,
            top_risk_factors=top_risk_factors,
            predicted_delay_minutes=predicted_delay,
            model_version=self.model_version,
            inference_latency_ms=latency_ms,
        )
        
        return result
    
    def predict_with_shap(
        self,
        order_id: str,
        features: dict[str, float],
    ) -> PredictionResult:
        """
        Make prediction with SHAP explainability.
        
        Args:
            order_id: Order identifier
            features: Feature dict from FeatureBuilder
        
        Returns:
            PredictionResult with top risk factors explained
        """
        start_time = time.time()
        
        # ===== Validate Input =====
        try:
            self.feature_builder.validate_features(features)
        except ValueError as e:
            raise ValueError(f"Invalid features for order {order_id}: {e}")
        
        # ===== Impute Missing Features =====
        features = self.feature_builder.impute_features(features, self.feature_stats)
        
        # ===== Build Feature Vector =====
        X = np.array([[features[name] for name in self.feature_names]])
        
        # ===== Prediction =====
        y_pred_proba = self.model.predict_proba(X)[:, 1]
        risk_score = float(y_pred_proba[0])
        
        # ===== Decision =====
        is_high_risk = risk_score > self.optimal_threshold
        
        # ===== Confidence =====
        confidence_dist = abs(risk_score - 0.5)
        if confidence_dist > 0.3:
            confidence = "high"
        elif confidence_dist > 0.15:
            confidence = "medium"
        else:
            confidence = "low"
        
        # ===== Predicted Delay =====
        # Risk-proportional estimate (same logic as predict() above).
        if is_high_risk:
            excess = risk_score - self.optimal_threshold
            range_ = max(1.0 - self.optimal_threshold, 1e-6)
            predicted_delay = round((excess / range_) * 60.0, 1)
        else:
            predicted_delay = 0.0
        
        # ===== SHAP Explainability =====
        explainer = self._get_explainer()
        shap_values = explainer.shap_values(X)
        
        # Top 5 risk factors
        top_risk_factors = self._extract_top_factors(
            shap_values[0],
            features,
            top_k=5,
        )
        
        latency_ms = (time.time() - start_time) * 1000
        
        result = PredictionResult(
            order_id=order_id,
            risk_score=risk_score,
            is_high_risk=is_high_risk,
            confidence=confidence,
            top_risk_factors=top_risk_factors,
            predicted_delay_minutes=predicted_delay,
            model_version=self.model_version,
            inference_latency_ms=latency_ms,
        )
        
        return result
    
    def _extract_top_factors(
        self,
        shap_values: np.ndarray,
        features: dict[str, float],
        top_k: int = 5,
    ) -> list[dict[str, Any]]:
        """
        Extract top K SHAP factors from prediction.
        
        Args:
            shap_values: SHAP values for the prediction
            features: Feature values
            top_k: Number of top factors
        
        Returns:
            List of dicts with factor details
        """
        factors = []
        
        for i, feature_name in enumerate(self.feature_names):
            shap_val = shap_values[i]
            feature_val = features[feature_name]
            
            # Determine direction
            if shap_val > 0:
                direction = "increases_risk"
            elif shap_val < 0:
                direction = "decreases_risk"
            else:
                direction = "neutral"
            
            factors.append({
                "feature": feature_name,
                "value": float(feature_val),
                "contribution": float(abs(shap_val)),
                "direction": direction,
                "shap_value": float(shap_val),
            })
        
        # Sort by absolute contribution
        factors.sort(key=lambda x: x["contribution"], reverse=True)
        
        return factors[:top_k]
    
    def benchmark(self, n_predictions: int = 1000) -> float:
        """
        Benchmark inference speed.
        
        Args:
            n_predictions: Number of predictions to benchmark
        
        Returns:
            Average latency in milliseconds
        """
        # Create dummy features
        dummy_features = {name: 0.5 for name in self.feature_names}
        
        latencies = []
        
        for _ in range(n_predictions):
            result = self.predict("benchmark-order", dummy_features)
            latencies.append(result.inference_latency_ms)
        
        avg_latency = np.mean(latencies)
        p99_latency = np.percentile(latencies, 99)
        
        print(f"Benchmark ({n_predictions} predictions):")
        print(f"  Average latency: {avg_latency:.2f}ms")
        print(f"  P99 latency: {p99_latency:.2f}ms")
        print(f"  Max latency: {np.max(latencies):.2f}ms")
        
        if avg_latency > 50:
            raise ValueError(
                f"Average inference latency ({avg_latency:.2f}ms) exceeds 50ms SLA"
            )
        
        return avg_latency
