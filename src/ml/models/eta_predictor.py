"""
ETA Predictor using XGBoost with SHAP explainability.
Implements quantile prediction intervals and calibrated confidence.
"""

from __future__ import annotations

import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd
import shap
import xgboost as xgb
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import (
    mean_absolute_error,
    mean_absolute_percentage_error,
    mean_squared_error,
    r2_score,
)

from src.backend.app.core.config import settings
from src.ml.models.base_model import BaseMLModel

try:
    import mlflow

    _HAS_MLFLOW = True
except Exception:
    mlflow = None
    _HAS_MLFLOW = False


class ETAPredictor(BaseMLModel):
    """XGBoost ETA model with quantile intervals and calibrated confidence."""

    def __init__(
        self,
        model_name: str = "eta_predictor",
        version: Optional[str] = None,
        model_path: Optional[Path] = None,
        xgb_params: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(model_name, version, model_path)

        self.xgb_params = xgb_params or {
            "objective": "reg:squarederror",
            "max_depth": 6,
            "learning_rate": 0.05,
            "n_estimators": 500,
            "subsample": 0.8,
            "colsample_bytree": 0.8,
            "min_child_weight": 3,
            "gamma": 0.1,
            "reg_alpha": 0.1,
            "reg_lambda": 1.0,
            "random_state": 42,
            "n_jobs": -1,
            "tree_method": "hist",
            "early_stopping_rounds": 50,
        }

        self.feature_bounds: Dict[str, Tuple[float, float]] = {}
        self.feature_means: Dict[str, float] = {}
        self.feature_stds: Dict[str, float] = {}

        self.model_p10: Optional[xgb.XGBRegressor] = None
        self.model_p50: Optional[xgb.XGBRegressor] = None
        self.model_p90: Optional[xgb.XGBRegressor] = None
        self.calibrator: Optional[IsotonicRegression] = None

        self.explainer = None
        self.residual_quantiles: Dict[str, float] = {}
        self.calibration_metrics: Dict[str, Any] = {}

    def _get_framework_name(self) -> str:
        return "xgboost"

    def train(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        X_val: Optional[pd.DataFrame] = None,
        y_val: Optional[pd.Series] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """
        Train p10/p50/p90 models and isotonic confidence calibrator.
        """
        start_time = datetime.now(timezone.utc).timestamp()
        self._compute_feature_statistics(X_train)

        eval_set = None
        if X_val is not None and y_val is not None:
            eval_set = [(X_train, y_train), (X_val, y_val)]

        params_p50 = self.xgb_params.copy()
        params_p50["objective"] = "reg:squarederror"
        self.model_p50 = xgb.XGBRegressor(**params_p50)
        self.model_p50.fit(
            X_train,
            y_train,
            eval_set=eval_set,
            verbose=kwargs.get("verbose", False),
        )

        params_p10 = self.xgb_params.copy()
        params_p10["objective"] = "reg:quantileerror"
        params_p10["quantile_alpha"] = 0.1
        self.model_p10 = xgb.XGBRegressor(**params_p10)
        self.model_p10.fit(
            X_train,
            y_train,
            eval_set=eval_set,
            verbose=kwargs.get("verbose", False),
        )

        params_p90 = self.xgb_params.copy()
        params_p90["objective"] = "reg:quantileerror"
        params_p90["quantile_alpha"] = 0.9
        self.model_p90 = xgb.XGBRegressor(**params_p90)
        self.model_p90.fit(
            X_train,
            y_train,
            eval_set=eval_set,
            verbose=kwargs.get("verbose", False),
        )

        self.model = self.model_p50

        train_pred = self.model_p50.predict(X_train)
        metrics: Dict[str, Any] = {
            "train_mae": float(mean_absolute_error(y_train, train_pred)),
            "train_rmse": float(np.sqrt(mean_squared_error(y_train, train_pred))),
            "train_r2": float(r2_score(y_train, train_pred)),
            "training_time_seconds": float(datetime.now(timezone.utc).timestamp() - start_time),
            "n_samples": int(len(X_train)),
            "n_features": int(X_train.shape[1]),
        }

        if X_val is None or y_val is None:
            X_val = X_train
            y_val = y_train

        raw_predictions = self.model_p50.predict(X_val)
        residuals = y_val.to_numpy(dtype=float) - raw_predictions
        abs_residuals = np.abs(residuals)

        metrics.update(
            {
                "val_mae": float(mean_absolute_error(y_val, raw_predictions)),
                "val_rmse": float(np.sqrt(mean_squared_error(y_val, raw_predictions))),
                "val_r2": float(r2_score(y_val, raw_predictions)),
            }
        )

        self.residual_quantiles = {
            "q10": float(np.percentile(residuals, 10)),
            "q50": float(np.percentile(residuals, 50)),
            "q90": float(np.percentile(residuals, 90)),
            "p50_abs_error": float(np.percentile(abs_residuals, 50)),
            "p90_abs_error": float(np.percentile(abs_residuals, 90)),
        }

        actual_within_5min = (np.abs(y_val.to_numpy(dtype=float) - raw_predictions) <= 5.0).astype(float)
        self.calibrator = IsotonicRegression(out_of_bounds="clip")
        self.calibrator.fit(abs_residuals, actual_within_5min)

        self.calibration_metrics = self.evaluate_calibration(
            y_true=y_val,
            p50_pred=raw_predictions,
            confidence_scores=self.calibrator.predict(abs_residuals),
        )
        metrics["calibration"] = self.calibration_metrics

        sample_size = min(200, len(X_train))
        self.explainer = shap.TreeExplainer(
            self.model_p50,
            X_train.sample(n=sample_size, random_state=42),
        )

        self.set_metadata("feature_names", list(X_train.columns))
        self.set_metadata("trained_at", datetime.now(timezone.utc).isoformat())
        self.set_metadata("training_metrics", metrics)
        self.set_metadata("residual_quantiles", self.residual_quantiles)
        self.set_metadata("calibration_metrics", self.calibration_metrics)

        if kwargs.get("log_mlflow", True):
            self._log_training_run_to_mlflow(metrics)

        return metrics

    def predict(
        self,
        X: pd.DataFrame,
        return_proba: bool = False,
    ) -> Any:
        """
        Return full prediction object for one input row.

        For backward compatibility, batch inputs return p50 numpy predictions.
        """
        if len(X) != 1:
            if self.model_p50 is None:
                raise ValueError("Model not trained or loaded")
            return self.model_p50.predict(X)

        bundle = self.predict_with_intervals(X)
        is_ood = not bool(self.detect_ood(X)[0])

        top_features: Dict[str, float] = {}
        explanation_text = "No explanation available"
        try:
            exp = self.explain(X, sample_idx=0)
            ranked = exp.get("top_features", [])[:3]
            top_features = {str(k): float(v) for k, v in ranked}
            explanation_text = self._build_human_explanation(top_features)
        except Exception:
            pass

        eta_p10 = float(bundle["p10"][0])
        eta_p50 = float(bundle["p50"][0])
        eta_p90 = float(bundle["p90"][0])

        return {
            "eta_minutes": eta_p50,
            "eta_p10": eta_p10,
            "eta_p90": eta_p90,
            "interval_width_minutes": float(np.maximum(eta_p90 - eta_p10, 1.0)),
            "confidence_within_5min": float(bundle["confidence_within_5min"][0]),
            "is_ood": is_ood,
            "top_features": top_features,
            "explanation": explanation_text,
        }

    def predict_with_confidence(self, X: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        bundle = self.predict_with_intervals(X)
        return bundle["p50"], bundle["confidence_within_5min"]

    def predict_with_intervals(self, X: pd.DataFrame) -> Dict[str, np.ndarray]:
        if self.model_p50 is None:
            raise ValueError("Model not trained or loaded")

        p50 = self.model_p50.predict(X)

        # Migration path: old models may not have quantile estimators.
        if self.model_p10 is not None and self.model_p90 is not None and self.model_p10 is not self.model_p50:
            p10 = self.model_p10.predict(X)
            p90 = self.model_p90.predict(X)
        else:
            half = float(self.residual_quantiles.get("p90_abs_error", 8.0))
            p10 = p50 - half
            p90 = p50 + half

        p10 = np.minimum(p10, p50)
        p90 = np.maximum(p90, p50)

        # Ensure strict ordering p10 < p50 < p90 with minimal epsilon.
        eps = 1e-3
        p10 = np.where(p10 >= p50, p50 - eps, p10)
        p90 = np.where(p90 <= p50, p50 + eps, p90)

        interval_half_width = np.maximum((p90 - p10) / 2.0, eps)
        confidence = self._confidence_from_error_proxy(interval_half_width)

        return {
            "p10": p10,
            "p50": p50,
            "p90": p90,
            "confidence_within_5min": confidence,
        }

    def compute_confidence(self, X: pd.DataFrame) -> np.ndarray:
        """Backward-compatible confidence API."""
        return self.predict_with_intervals(X)["confidence_within_5min"]

    def evaluate_calibration(
        self,
        y_true: pd.Series,
        p50_pred: np.ndarray,
        confidence_scores: np.ndarray,
        buckets: Optional[List[Tuple[float, float]]] = None,
    ) -> Dict[str, Any]:
        if buckets is None:
            buckets = [(0.7, 0.8), (0.8, 0.9), (0.9, 1.0)]

        abs_err = np.abs(y_true.to_numpy(dtype=float) - p50_pred)
        within_5 = (abs_err <= 5.0).astype(float)

        bucket_rows: List[Dict[str, Any]] = []
        weighted_error = 0.0

        for lo, hi in buckets:
            if hi >= 1.0:
                mask = (confidence_scores >= lo) & (confidence_scores <= hi)
            else:
                mask = (confidence_scores >= lo) & (confidence_scores < hi)

            count = int(mask.sum())
            if count == 0:
                bucket_rows.append(
                    {
                        "bucket": f"{lo:.1f}-{hi:.1f}",
                        "count": 0,
                        "stated_confidence": float((lo + hi) / 2.0),
                        "actual_accuracy": None,
                        "calibration_error": None,
                    }
                )
                continue

            actual_acc = float(within_5[mask].mean())
            stated = float(np.mean(confidence_scores[mask]))
            cal_err = abs(actual_acc - stated)
            weighted_error += cal_err * count

            bucket_rows.append(
                {
                    "bucket": f"{lo:.1f}-{hi:.1f}",
                    "count": count,
                    "stated_confidence": stated,
                    "actual_accuracy": actual_acc,
                    "calibration_error": float(cal_err),
                }
            )

        ece = float(weighted_error / len(y_true)) if len(y_true) else 0.0

        return {
            "expected_calibration_error": ece,
            "bucket_analysis": bucket_rows,
            "overall_accuracy_within_5min": float(within_5.mean()) if len(within_5) else 0.0,
            "total_predictions": int(len(y_true)),
        }

    def detect_ood(self, X: pd.DataFrame, threshold: float = 3.0) -> np.ndarray:
        if not self.feature_means:
            return np.ones(len(X), dtype=bool)

        in_distribution = np.ones(len(X), dtype=bool)
        for col in X.columns:
            if col not in self.feature_means:
                continue
            std = self.feature_stds.get(col, 0.0)
            if std <= 0:
                continue
            mean = self.feature_means[col]
            z = np.abs((X[col].to_numpy(dtype=float) - mean) / std)
            in_distribution &= z <= threshold
        return in_distribution

    def explain(self, X: pd.DataFrame, sample_idx: Optional[int] = None) -> Dict[str, Any]:
        if self.explainer is None:
            raise ValueError("Explainer not initialized")

        X_explain = X.iloc[[sample_idx]] if sample_idx is not None else X
        shap_values = self.explainer.shap_values(X_explain)
        feature_names = list(X.columns)

        if sample_idx is not None:
            shap_map = {feature_names[i]: float(shap_values[0][i]) for i in range(len(feature_names))}
            top_features = sorted(shap_map.items(), key=lambda kv: abs(kv[1]), reverse=True)[:3]
            return {
                "shap_values": shap_map,
                "top_features": top_features,
                "base_value": float(self.explainer.expected_value),
                "prediction": float(self.model_p50.predict(X_explain)[0]),
            }

        mean_abs = np.abs(shap_values).mean(axis=0)
        importance = {feature_names[i]: float(mean_abs[i]) for i in range(len(feature_names))}
        top_features = sorted(importance.items(), key=lambda kv: kv[1], reverse=True)[:10]
        return {
            "feature_importance": importance,
            "top_features": top_features,
            "base_value": float(self.explainer.expected_value),
            "n_samples": int(len(X_explain)),
        }

    def get_feature_importance(self) -> Dict[str, float]:
        if self.model_p50 is None:
            raise ValueError("Model not trained or loaded")
        names = self.metadata.get("feature_names", [])
        imp = self.model_p50.feature_importances_
        if len(names) != len(imp):
            names = [f"feature_{i}" for i in range(len(imp))]
        return {name: float(score) for name, score in zip(names, imp)}

    def evaluate_accuracy(
        self,
        X_test: pd.DataFrame,
        y_test: pd.Series,
        thresholds: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        if self.model_p50 is None:
            raise ValueError("Model not trained or loaded")

        if thresholds is None:
            thresholds = [1, 2, 3, 5, 10]

        predictions = self.model_p50.predict(X_test)
        errors = np.abs(predictions - y_test.to_numpy(dtype=float))

        result: Dict[str, Any] = {
            "mae": float(mean_absolute_error(y_test, predictions)),
            "mape": float(mean_absolute_percentage_error(y_test, predictions) * 100.0),
            "rmse": float(np.sqrt(mean_squared_error(y_test, predictions))),
            "r2": float(r2_score(y_test, predictions)),
            "n_samples": int(len(X_test)),
        }

        for t in thresholds:
            result[f"accuracy_within_{t}min"] = float((errors <= t).mean() * 100.0)

        return result

    def _compute_feature_statistics(self, X: pd.DataFrame) -> None:
        for col in X.columns:
            values = X[col].to_numpy(dtype=float)
            self.feature_means[col] = float(np.mean(values))
            self.feature_stds[col] = float(np.std(values))
            self.feature_bounds[col] = (float(np.min(values)), float(np.max(values)))

    def _confidence_from_error_proxy(self, error_proxy: np.ndarray) -> np.ndarray:
        if self.calibrator is None:
            p90_abs = float(self.residual_quantiles.get("p90_abs_error", 10.0))
            return np.clip(1.0 - (error_proxy / max(p90_abs, 1e-6)), 0.0, 1.0)
        return np.clip(self.calibrator.predict(error_proxy), 0.0, 1.0)

    def _build_human_explanation(self, top_features: Dict[str, float]) -> str:
        if not top_features:
            return "ETA estimated from model baseline"

        feature, value = next(iter(top_features.items()))
        direction = "adding" if value >= 0 else "reducing"
        magnitude = int(round(abs(value)))
        return f"{feature} is {direction} ~{magnitude} min"

    def _log_training_run_to_mlflow(self, metrics: Dict[str, Any]) -> None:
        if not _HAS_MLFLOW:
            return

        try:
            mlflow.set_tracking_uri(settings.MLFLOW_TRACKING_URI)
            mlflow.set_experiment(settings.MLFLOW_EXPERIMENT_NAME)

            with mlflow.start_run(run_name=f"eta_quantile_{self.version}"):
                mlflow.log_params(
                    {
                        **self.xgb_params,
                        "has_quantile_models": True,
                        "calibration_method": "isotonic_regression",
                    }
                )

                for k, v in metrics.items():
                    if isinstance(v, (int, float)):
                        mlflow.log_metric(k, float(v))
                if "calibration" in metrics:
                    cal = metrics["calibration"]
                    if "expected_calibration_error" in cal:
                        mlflow.log_metric("ece", float(cal["expected_calibration_error"]))

                with tempfile.TemporaryDirectory() as td:
                    tmp = Path(td)
                    joblib.dump(self.model_p10, tmp / "model_p10.pkl")
                    joblib.dump(self.model_p50, tmp / "model_p50.pkl")
                    joblib.dump(self.model_p90, tmp / "model_p90.pkl")
                    joblib.dump(self.calibrator, tmp / "calibrator.pkl")

                    curve_json = {
                        "bucket_analysis": self.calibration_metrics.get("bucket_analysis", []),
                        "ece": self.calibration_metrics.get("expected_calibration_error", None),
                    }
                    with (tmp / "calibration_curve.json").open("w", encoding="utf-8") as fp:
                        json.dump(curve_json, fp, indent=2)

                    mlflow.log_artifact(str(tmp / "model_p10.pkl"), artifact_path="model_artifacts")
                    mlflow.log_artifact(str(tmp / "model_p50.pkl"), artifact_path="model_artifacts")
                    mlflow.log_artifact(str(tmp / "model_p90.pkl"), artifact_path="model_artifacts")
                    mlflow.log_artifact(str(tmp / "calibrator.pkl"), artifact_path="model_artifacts")
                    mlflow.log_artifact(str(tmp / "calibration_curve.json"), artifact_path="model_artifacts")
        except Exception:
            # Do not block training on tracking failures.
            return

    def _save_model_artifacts(self, path: Path) -> None:
        path.mkdir(parents=True, exist_ok=True)

        if self.model_p50 is None:
            raise ValueError("model_p50 missing; cannot save")

        # Primary local format
        self.model_p50.save_model(str(path / "model_p50.json"))
        if self.model_p10 is not None:
            self.model_p10.save_model(str(path / "model_p10.json"))
        if self.model_p90 is not None:
            self.model_p90.save_model(str(path / "model_p90.json"))

        # MLflow-friendly pickle artifacts
        if self.model_p10 is not None:
            joblib.dump(self.model_p10, path / "model_p10.pkl")
        joblib.dump(self.model_p50, path / "model_p50.pkl")
        if self.model_p90 is not None:
            joblib.dump(self.model_p90, path / "model_p90.pkl")

        if self.calibrator is not None:
            joblib.dump(self.calibrator, path / "calibrator.pkl")

        if self.explainer is not None:
            joblib.dump(self.explainer, path / "shap_explainer.pkl")

        with (path / "calibration_curve.json").open("w", encoding="utf-8") as fp:
            json.dump(
                {
                    "bucket_analysis": self.calibration_metrics.get("bucket_analysis", []),
                    "ece": self.calibration_metrics.get("expected_calibration_error", None),
                },
                fp,
                indent=2,
            )

        joblib.dump(
            {
                "feature_means": self.feature_means,
                "feature_stds": self.feature_stds,
                "feature_bounds": self.feature_bounds,
                "residual_quantiles": self.residual_quantiles,
                "calibration_metrics": self.calibration_metrics,
            },
            path / "feature_statistics.pkl",
        )

    def _load_model_artifacts(self, path: Path) -> None:
        # New-format first
        p50_json = path / "model_p50.json"
        p10_json = path / "model_p10.json"
        p90_json = path / "model_p90.json"

        p50_pkl = path / "model_p50.pkl"
        p10_pkl = path / "model_p10.pkl"
        p90_pkl = path / "model_p90.pkl"

        if p50_json.exists():
            self.model_p50 = xgb.XGBRegressor()
            self.model_p50.load_model(str(p50_json))
            self.model = self.model_p50

            if p10_json.exists() and p90_json.exists():
                self.model_p10 = xgb.XGBRegressor()
                self.model_p10.load_model(str(p10_json))
                self.model_p90 = xgb.XGBRegressor()
                self.model_p90.load_model(str(p90_json))
            else:
                self.model_p10 = self.model_p50
                self.model_p90 = self.model_p50

        elif p50_pkl.exists():
            self.model_p50 = joblib.load(p50_pkl)
            self.model = self.model_p50
            self.model_p10 = joblib.load(p10_pkl) if p10_pkl.exists() else self.model_p50
            self.model_p90 = joblib.load(p90_pkl) if p90_pkl.exists() else self.model_p50

        else:
            # Legacy migration path.
            legacy_json = path / "xgboost_model.json"
            legacy_pkl = path / "xgboost_model.pkl"
            if legacy_json.exists():
                legacy = xgb.XGBRegressor()
                legacy.load_model(str(legacy_json))
            elif legacy_pkl.exists():
                legacy = joblib.load(legacy_pkl)
            else:
                raise FileNotFoundError(
                    "No model artifacts found. Expected model_p50.* or legacy xgboost_model.*"
                )

            self.model = legacy
            self.model_p50 = legacy
            self.model_p10 = legacy
            self.model_p90 = legacy

        stats_file = path / "feature_statistics.pkl"
        if stats_file.exists():
            stats = joblib.load(stats_file)
            self.feature_means = stats.get("feature_means", {})
            self.feature_stds = stats.get("feature_stds", {})
            self.feature_bounds = stats.get("feature_bounds", {})
            self.residual_quantiles = stats.get("residual_quantiles", {})
            self.calibration_metrics = stats.get("calibration_metrics", {})

        calibrator_file = path / "calibrator.pkl"
        self.calibrator = joblib.load(calibrator_file) if calibrator_file.exists() else None

        explainer_file = path / "shap_explainer.pkl"
        if explainer_file.exists():
            self.explainer = joblib.load(explainer_file)

        if hasattr(self.model_p50, "feature_names_in_"):
            self.set_metadata("feature_names", list(self.model_p50.feature_names_in_))
