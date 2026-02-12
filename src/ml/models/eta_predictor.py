"""
ETA Predictor using XGBoost with SHAP Explainability
Production-ready implementation with confidence scoring and OOD detection
"""

import numpy as np
import pandas as pd
import xgboost as xgb
import shap
import joblib
from typing import Dict, Any, Optional, Tuple
from pathlib import Path
from scipy.stats import entropy

from src.ml.models.base_model import BaseMLModel


class ETAPredictor(BaseMLModel):
    """
    XGBoost-based ETA prediction model with explainability
    
    Features:
    - SHAP-based explanations
    - Confidence scoring via prediction entropy
    - Out-of-distribution detection
    - Feature importance tracking
    - Uncertainty quantification
    """
    
    def __init__(
        self,
        model_name: str = "eta_predictor",
        version: Optional[str] = None,
        model_path: Optional[Path] = None,
        xgb_params: Optional[Dict[str, Any]] = None
    ):
        """
        Initialize ETA Predictor
        
        Args:
            model_name: Model identifier
            version: Model version
            model_path: Path to model artifacts
            xgb_params: XGBoost hyperparameters
        """
        super().__init__(model_name, version, model_path)
        
        # Default XGBoost parameters (optimized for ETA prediction)
        self.xgb_params = xgb_params or {
            'objective': 'reg:squarederror',
            'max_depth': 6,
            'learning_rate': 0.05,
            'n_estimators': 500,
            'subsample': 0.8,
            'colsample_bytree': 0.8,
            'min_child_weight': 3,
            'gamma': 0.1,
            'reg_alpha': 0.1,
            'reg_lambda': 1.0,
            'random_state': 42,
            'n_jobs': -1,
            'tree_method': 'hist',
            'early_stopping_rounds': 50
        }
        
        # Store training statistics for OOD detection
        self.feature_bounds = {}
        self.feature_means = {}
        self.feature_stds = {}
        
        # SHAP explainer (computed after training)
        self.explainer = None
    
    def _get_framework_name(self) -> str:
        return "xgboost"
    
    def train(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        X_val: Optional[pd.DataFrame] = None,
        y_val: Optional[pd.Series] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Train XGBoost model with validation monitoring
        
        Returns:
            Training metrics (MAE, RMSE, R2, training time)
        """
        from datetime import datetime
        import time
        from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
        
        start_time = time.time()
        
        # Store feature statistics for OOD detection
        self._compute_feature_statistics(X_train)
        
        # Initialize model
        self.model = xgb.XGBRegressor(**self.xgb_params)
        
        # Setup eval set for early stopping
        eval_set = []
        if X_val is not None and y_val is not None:
            eval_set = [(X_train, y_train), (X_val, y_val)]
        
        # Train
        self.model.fit(
            X_train,
            y_train,
            eval_set=eval_set if eval_set else None,
            verbose=kwargs.get('verbose', 10)
        )
        
        training_time = time.time() - start_time
        
        # Compute metrics
        train_pred = self.model.predict(X_train)
        train_mae = mean_absolute_error(y_train, train_pred)
        train_rmse = np.sqrt(mean_squared_error(y_train, train_pred))
        train_r2 = r2_score(y_train, train_pred)
        
        metrics = {
            'train_mae': float(train_mae),
            'train_rmse': float(train_rmse),
            'train_r2': float(train_r2),
            'training_time_seconds': training_time,
            'n_samples': len(X_train),
            'n_features': X_train.shape[1]
        }
        
        # Validation metrics
        if X_val is not None and y_val is not None:
            val_pred = self.model.predict(X_val)
            val_mae = mean_absolute_error(y_val, val_pred)
            val_rmse = np.sqrt(mean_squared_error(y_val, val_pred))
            val_r2 = r2_score(y_val, val_pred)
            
            metrics.update({
                'val_mae': float(val_mae),
                'val_rmse': float(val_rmse),
                'val_r2': float(val_r2)
            })
        
        # Initialize SHAP explainer (on sample of training data for speed)
        sample_size = min(100, len(X_train))
        self.explainer = shap.TreeExplainer(
            self.model,
            X_train.sample(n=sample_size, random_state=42)
        )
        
        # Update metadata
        self.set_metadata('training_metrics', metrics)
        self.set_metadata('feature_names', list(X_train.columns))
        self.set_metadata('trained_at', datetime.utcnow().isoformat())
        
        return metrics
    
    def predict(
        self,
        X: pd.DataFrame,
        return_proba: bool = False
    ) -> np.ndarray:
        """
        Generate ETA predictions (in minutes)
        
        Args:
            X: Feature matrix
            return_proba: Not used (regression model)
        
        Returns:
            Array of ETA predictions in minutes
        """
        if not self.model:
            raise ValueError("Model not trained or loaded")
        
        predictions = self.model.predict(X)
        return predictions
    
    def predict_with_confidence(
        self,
        X: pd.DataFrame
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Predict with confidence scores
        
        Returns:
            (predictions, confidence_scores)
        """
        predictions = self.predict(X)
        confidence = self.compute_confidence(X)
        
        return predictions, confidence
    
    def compute_confidence(
        self,
        X: pd.DataFrame
    ) -> np.ndarray:
        """
        Compute prediction confidence using tree variance
        
        Lower variance across trees = higher confidence
        
        Returns:
            Confidence scores [0-1]
        """
        if not self.model:
            raise ValueError("Model not trained or loaded")
        
        # Get predictions from all trees
        # Note: XGBoost doesn't expose per-tree predictions easily,
        # so we use a proxy: feature-based variance estimate
        
        # Simple heuristic: distance from feature means
        # If features are close to training means, higher confidence
        distances = []
        for col in X.columns:
            if col in self.feature_means:
                mean = self.feature_means[col]
                std = self.feature_stds[col]
                if std > 0:
                    # Normalized distance
                    distance = np.abs(X[col] - mean) / std
                    distances.append(distance)
        
        if not distances:
            return np.ones(len(X))
        
        # Average distance across features
        avg_distance = np.mean(distances, axis=0)
        
        # Convert to confidence (inverse of distance)
        # Using sigmoid to bound to [0, 1]
        confidence = 1 / (1 + avg_distance)
        
        return confidence
    
    def detect_ood(
        self,
        X: pd.DataFrame,
        threshold: float = 3.0
    ) -> np.ndarray:
        """
        Detect out-of-distribution samples
        
        Uses feature bounds checking (samples outside 3 std are OOD)
        
        Args:
            X: Feature matrix
            threshold: Number of standard deviations for OOD
        
        Returns:
            Boolean array (True = in-distribution, False = OOD)
        """
        if not self.feature_means:
            # No training statistics available
            return np.ones(len(X), dtype=bool)
        
        in_distribution = np.ones(len(X), dtype=bool)
        
        for col in X.columns:
            if col in self.feature_means:
                mean = self.feature_means[col]
                std = self.feature_stds[col]
                
                if std > 0:
                    # Z-score based OOD detection
                    z_scores = np.abs((X[col] - mean) / std)
                    ood_mask = z_scores > threshold
                    in_distribution &= ~ood_mask
        
        return in_distribution
    
    def explain(
        self,
        X: pd.DataFrame,
        sample_idx: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Generate SHAP-based explanations
        
        Args:
            X: Features to explain
            sample_idx: Specific sample (None = all samples)
        
        Returns:
            Dict with SHAP values, feature importance, base value
        """
        if not self.explainer:
            raise ValueError("Model not trained or explainer not initialized")
        
        # Compute SHAP values
        if sample_idx is not None:
            X_explain = X.iloc[[sample_idx]]
        else:
            X_explain = X
        
        shap_values = self.explainer.shap_values(X_explain)
        
        # Get feature names
        feature_names = list(X.columns)
        
        if sample_idx is not None:
            # Single sample explanation
            explanation = {
                'shap_values': {
                    feature: float(shap_values[0][i])
                    for i, feature in enumerate(feature_names)
                },
                'base_value': float(self.explainer.expected_value),
                'prediction': float(self.model.predict(X_explain)[0]),
                'feature_values': X_explain.iloc[0].to_dict()
            }
            
            # Sort by absolute SHAP value
            sorted_features = sorted(
                explanation['shap_values'].items(),
                key=lambda x: abs(x[1]),
                reverse=True
            )
            explanation['top_features'] = sorted_features[:5]
            
        else:
            # Global explanation (mean absolute SHAP)
            mean_abs_shap = np.abs(shap_values).mean(axis=0)
            
            explanation = {
                'feature_importance': {
                    feature: float(mean_abs_shap[i])
                    for i, feature in enumerate(feature_names)
                },
                'base_value': float(self.explainer.expected_value),
                'n_samples': len(X)
            }
            
            # Sort features by importance
            sorted_features = sorted(
                explanation['feature_importance'].items(),
                key=lambda x: x[1],
                reverse=True
            )
            explanation['top_features'] = sorted_features[:10]
        
        return explanation
    
    def get_feature_importance(self) -> Dict[str, float]:
        """Get XGBoost native feature importance"""
        if not self.model:
            raise ValueError("Model not trained or loaded")
        
        importance = self.model.feature_importances_
        feature_names = self.metadata.get('feature_names', [])
        
        if len(feature_names) != len(importance):
            # Fallback to generic names
            feature_names = [f"feature_{i}" for i in range(len(importance))]
        
        return {
            name: float(imp)
            for name, imp in zip(feature_names, importance)
        }
    
    def evaluate_accuracy(
        self,
        X_test: pd.DataFrame,
        y_test: pd.Series,
        thresholds: Optional[list] = None
    ) -> Dict[str, Any]:
        """
        Evaluate prediction accuracy at multiple thresholds
        
        Measures: % of predictions within ±N minutes
        
        Args:
            X_test: Test features
            y_test: Ground truth ETA values
            thresholds: List of error thresholds (default: [1, 2, 3, 5, 10])
        
        Returns:
            Dict with accuracy metrics:
            {
                'mae': float,
                'mape': float,
                'rmse': float,
                'r2': float,
                'accuracy_within_Nmin': float (%)
            }
        """
        from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score, mean_absolute_percentage_error
        
        if thresholds is None:
            thresholds = [1, 2, 3, 5, 10]
        
        # Generate predictions
        predictions = self.predict(X_test)
        
        # Calculate base metrics
        mae = mean_absolute_error(y_test, predictions)
        mape = mean_absolute_percentage_error(y_test, predictions)
        rmse = np.sqrt(mean_squared_error(y_test, predictions))
        r2 = r2_score(y_test, predictions)
        
        # Calculate errors
        errors = np.abs(predictions - y_test.values)
        
        # Calculate accuracy at each threshold
        results = {
            'mae': float(mae),
            'mape': float(mape) * 100,  # Convert to percentage
            'rmse': float(rmse),
            'r2': float(r2),
            'n_samples': len(X_test)
        }
        
        # Add threshold-based accuracies
        for threshold in thresholds:
            accuracy = (errors <= threshold).mean() * 100
            results[f'accuracy_within_{threshold}min'] = float(accuracy)
        
        # Add detailed statistics
        results['error_statistics'] = {
            'min': float(errors.min()),
            'max': float(errors.max()),
            'median': float(np.median(errors)),
            'std': float(errors.std()),
            'p25': float(np.percentile(errors, 25)),
            'p50': float(np.percentile(errors, 50)),
            'p75': float(np.percentile(errors, 75)),
            'p90': float(np.percentile(errors, 90)),
            'p95': float(np.percentile(errors, 95)),
            'p99': float(np.percentile(errors, 99))
        }
        
        return results
    
    def _compute_feature_statistics(self, X: pd.DataFrame) -> None:
        """Store feature statistics for OOD detection"""
        for col in X.columns:
            self.feature_means[col] = float(X[col].mean())
            self.feature_stds[col] = float(X[col].std())
            self.feature_bounds[col] = (float(X[col].min()), float(X[col].max()))
    
    def _save_model_artifacts(self, path: Path) -> None:
        """Save XGBoost model and statistics"""
        # Save XGBoost model
        model_file = path / "xgboost_model.json"
        self.model.save_model(str(model_file))
        
        # Save statistics
        stats_file = path / "feature_statistics.pkl"
        joblib.dump({
            'feature_means': self.feature_means,
            'feature_stds': self.feature_stds,
            'feature_bounds': self.feature_bounds
        }, stats_file)
        
        # Save explainer (optional - can be regenerated)
        if self.explainer:
            explainer_file = path / "shap_explainer.pkl"
            joblib.dump(self.explainer, explainer_file)
    
    def _load_model_artifacts(self, path: Path) -> None:
        """Load XGBoost model and statistics"""
        # Load XGBoost model
        model_json = path / "xgboost_model.json"
        model_pkl = path / "xgboost_model.pkl"
        
        if model_json.exists():
            self.model = xgb.XGBRegressor()
            self.model.load_model(str(model_json))
        elif model_pkl.exists():
            # Fallback for legacy joblib-saved model
            self.model = joblib.load(model_pkl)
        else:
            raise FileNotFoundError("No model file found (xgboost_model.json or xgboost_model.pkl)")
        
        # Load statistics
        stats_file = path / "feature_statistics.pkl"
        if stats_file.exists():
            stats = joblib.load(stats_file)
            self.feature_means = stats['feature_means']
            self.feature_stds = stats['feature_stds']
            self.feature_bounds = stats['feature_bounds']
        
        # Capture feature names if available
        if hasattr(self.model, "feature_names_in_"):
            self.set_metadata("feature_names", list(self.model.feature_names_in_))
        
        # Load explainer
        explainer_file = path / "shap_explainer.pkl"
        if explainer_file.exists():
            self.explainer = joblib.load(explainer_file)
