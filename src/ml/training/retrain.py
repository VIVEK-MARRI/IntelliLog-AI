"""
Automated retraining pipeline for ETA model.
Uses processed training data and saves model artifacts.
"""

from __future__ import annotations
from typing import Dict, Any
from pathlib import Path
from datetime import datetime
import json
import pandas as pd
from sklearn.model_selection import train_test_split
import logging

try:
    import mlflow
    _HAS_MLFLOW = True
except Exception:  # pragma: no cover - explicit runtime fallback
    mlflow = None
    _HAS_MLFLOW = False

from scripts.train_model_production import ModelTrainer
from src.backend.app.core.config import settings

logger = logging.getLogger(__name__)


def retrain_production_model() -> Dict[str, Any]:
    data_path = Path("data/processed/training_data_enhanced.csv")
    if not data_path.exists():
        raise FileNotFoundError(f"Training data not found at {data_path}")

    df = pd.read_csv(data_path)

    target_col = "delivery_time_min"
    exclude_cols = [target_col, "order_time", "distance_category", "weight_category", "traffic", "weather", "order_type"]
    feature_cols = [col for col in df.columns if col not in exclude_cols]

    X = df[feature_cols]
    y = df[target_col]

    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    trainer = ModelTrainer()
    version = datetime.now().strftime("%Y%m%d_%H%M%S")
    mlflow_run_id = None

    if _HAS_MLFLOW:
        mlflow.set_tracking_uri(settings.MLFLOW_TRACKING_URI)
        mlflow.set_experiment(settings.MLFLOW_EXPERIMENT_NAME)

        with mlflow.start_run(run_name=f"eta_retrain_{version}") as run:
            mlflow_run_id = run.info.run_id
            mlflow.log_params(
                {
                    "target_col": target_col,
                    "n_samples": len(df),
                    "n_features": len(feature_cols),
                    "test_size": 0.2,
                    "random_state": 42,
                    "feature_columns": ",".join(feature_cols),
                }
            )

            trainer.train_ensemble(X_train, y_train, X_val, y_val)

            for model_name, metrics in trainer.metrics.items():
                for metric_name, metric_value in metrics.items():
                    if isinstance(metric_value, (int, float)):
                        mlflow.log_metric(f"{model_name}_{metric_name}", float(metric_value))

            version_dir = trainer.save_models(version=version)
            mlflow.log_artifacts(version_dir, artifact_path="model_artifacts")
    else:
        logger.warning("MLflow is not installed; retraining will proceed without experiment tracking.")
        trainer.train_ensemble(X_train, y_train, X_val, y_val)
        version_dir = trainer.save_models(version=version)

    latest_version_file = Path("models/latest_version.json")
    if latest_version_file.exists():
        with open(latest_version_file, "r") as f:
            latest = json.load(f)
    else:
        latest = {}

    latest.update({
        "version": f"v_{version}",
        "timestamp": datetime.now().isoformat(),
        "metrics": trainer.metrics,
        "models": list(trainer.models.keys()),
        "mlflow_run_id": mlflow_run_id,
    })

    with open(latest_version_file, "w") as f:
        json.dump(latest, f, indent=2)

    return {
        "version": f"v_{version}",
        "version_dir": str(version_dir),
        "metrics": trainer.metrics,
        "n_samples": len(df),
        "n_features": len(feature_cols),
        "mlflow_run_id": mlflow_run_id,
    }
