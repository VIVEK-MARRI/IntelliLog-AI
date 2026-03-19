"""
Automated retraining pipeline for continuous learning.
Runs daily to retrain models on recent delivery feedback.
"""

import asyncio
import logging
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Any, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sqlalchemy.orm import Session

from src.backend.app.db.models import (
    DeliveryFeedback,
    ModelRegistry,
    ModelTrainingLog,
    Tenant,
)
from src.backend.app.core.config import settings
from src.ml.models.eta_predictor import ETAPredictor
from src.ml.features.engineering import TrafficFeatureEngineer

try:
    import mlflow

    _HAS_MLFLOW = True
except Exception:
    mlflow = None
    _HAS_MLFLOW = False

logger = logging.getLogger(__name__)

# Quality thresholds
MIN_SAMPLES_FOR_TRAINING = 500
DATA_QUALITY_SCORE_THRESHOLD = 0.80  # 80%
MAE_IMPROVEMENT_THRESHOLD = 0.95  # Allow 5% degradation


class ModelRetrainer:
    """Automated model retraining pipeline."""

    def __init__(self, db_session: Session):
        """Initialize retrainer."""
        self.db = db_session
        self.mlflow_enabled = _HAS_MLFLOW

    def retrain_model(
        self, tenant_id: str, lookback_days: int = 30
    ) -> Dict[str, Any]:
        """
        Retrain model for a tenant using recent delivery feedback.

        Args:
            tenant_id: Tenant ID
            lookback_days: How many days of history to use for training

        Returns:
            Dict with status, model_version, metrics, improvement_pct
        """
        run_id = f"retrain_{tenant_id}_{datetime.utcnow().isoformat()}"
        training_log = ModelTrainingLog(
            tenant_id=tenant_id,
            run_id=run_id,
            status="running",
        )

        try:
            logger.info(f"Starting retraining for tenant {tenant_id}")

            # Fetch training data
            df = self._fetch_training_data(tenant_id, lookback_days)

            # Log number of samples
            training_log.num_training_samples = len(df)

            if len(df) < MIN_SAMPLES_FOR_TRAINING:
                msg = (
                    f"Insufficient training data: {len(df)} samples "
                    f"(minimum {MIN_SAMPLES_FOR_TRAINING})"
                )
                logger.warning(msg)
                training_log.status = "skipped"
                training_log.failure_reason = msg
                self.db.add(training_log)
                self.db.commit()
                return {
                    "status": "skipped",
                    "reason": msg,
                    "model_version": None,
                }

            # Data quality checks
            quality_score = self._check_data_quality(df)
            training_log.data_quality_score = quality_score

            if quality_score < DATA_QUALITY_SCORE_THRESHOLD:
                msg = f"Data quality too low: {quality_score:.2f} (threshold {DATA_QUALITY_SCORE_THRESHOLD})"
                logger.error(msg)
                training_log.status = "failed"
                training_log.failure_reason = msg
                self.db.add(training_log)
                self.db.commit()
                return {
                    "status": "failed",
                    "reason": msg,
                    "model_version": None,
                }

            # Prepare features
            X, y = self._prepare_features(df)

            # Train model
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.2, random_state=42
            )

            training_log.training_start_time = datetime.utcnow()
            model_version = self._train_and_evaluate(
                tenant_id, X_train, X_test, y_train, y_test, training_log
            )
            training_log.training_end_time = datetime.utcnow()

            if not model_version:
                training_log.status = "failed"
                training_log.failure_reason = "Training failed"
                self.db.add(training_log)
                self.db.commit()
                return {
                    "status": "failed",
                    "reason": "Model training failed",
                    "model_version": None,
                }

            # Check if model is better than current production
            improvement_pct, should_promote = self._compare_with_production(
                tenant_id, training_log
            )

            if should_promote:
                training_log.status = "success"
                training_log.model_version = model_version

                # Stage model in MLflow
                self._stage_model_for_ab_test(tenant_id, model_version, training_log)

                logger.info(
                    f"Model {model_version} ready for A/B test "
                    f"({improvement_pct:+.2f}% improvement)"
                )
                result_status = "promoted_to_staging"
            else:
                training_log.status = "success"
                training_log.model_version = model_version
                training_log.failure_reason = "Insufficient improvement for promotion"
                logger.warning(
                    f"Model {model_version} not promoted "
                    f"({improvement_pct:+.2f}% degradation)"
                )
                result_status = "archived"

            self.db.add(training_log)
            self.db.commit()

            return {
                "status": result_status,
                "model_version": model_version,
                "improvement_pct": improvement_pct,
                "samples": len(df),
                "data_quality_score": quality_score,
            }

        except Exception as e:
            logger.error(f"Error retraining model for {tenant_id}: {e}")
            training_log.status = "failed"
            training_log.error_log = str(e)
            training_log.failure_reason = str(e)
            self.db.add(training_log)
            self.db.commit()
            return {
                "status": "failed",
                "reason": str(e),
                "model_version": None,
            }

    def _fetch_training_data(
        self, tenant_id: str, lookback_days: int
    ) -> pd.DataFrame:
        """Fetch delivery feedback for training."""
        cutoff_time = datetime.utcnow() - timedelta(days=lookback_days)

        query = self.db.query(DeliveryFeedback).filter(
            DeliveryFeedback.tenant_id == tenant_id,
            DeliveryFeedback.created_at >= cutoff_time,
            DeliveryFeedback.actual_delivery_min.isnot(None),
            DeliveryFeedback.error_min.isnot(None),
        )

        records = query.all()
        logger.info(f"Fetched {len(records)} feedback records for {tenant_id}")

        data = [
            {
                "distance_km": r.distance_km or 0,
                "weight": r.weight or 1.0,  # Fallback if not stored in feedback
                "time_of_day": r.time_of_day,
                "day_of_week": r.day_of_week or 0,
                "traffic_condition": r.traffic_condition,
                "weather": r.weather,
                "actual_delivery_min": r.actual_delivery_min,
                "predicted_eta_min": r.predicted_eta_min,
                "error_min": r.error_min,
            }
            for r in records
        ]

        return pd.DataFrame(data)

    def _check_data_quality(self, df: pd.DataFrame) -> float:
        """
        Check data quality and return score (0-1).

        Checks:
        - Missing values in key columns
        - Outliers (errors > 60 min)
        - Duplicates
        """
        try:
            quality_issues = 0
            total_checks = 5

            # Check 1: Missing values
            key_cols = ["distance_km", "actual_delivery_min", "predicted_eta_min"]
            missing_ratio = df[key_cols].isnull().sum().sum() / (len(df) * len(key_cols))
            if missing_ratio > 0.1:  # Allow 10% missing
                quality_issues += 1
            logger.debug(f"Missing values ratio: {missing_ratio:.2%}")

            # Check 2: Outliers (error > 60 min)
            outliers = (df["error_min"].abs() > 60).sum()
            outlier_ratio = outliers / len(df)
            if outlier_ratio > 0.05:  # Allow 5% outliers
                quality_issues += 1
            logger.debug(f"Outlier ratio: {outlier_ratio:.2%}")

            # Check 3: Distance sanity (0-200 km)
            invalid_distance = ((df["distance_km"] < 0) | (df["distance_km"] > 200)).sum()
            if invalid_distance / len(df) > 0.01:
                quality_issues += 1
            logger.debug(f"Invalid distance count: {invalid_distance}")

            # Check 4: Delivery time sanity (1-480 min)
            invalid_time = (
                (df["actual_delivery_min"] < 1) | (df["actual_delivery_min"] > 480)
            ).sum()
            if invalid_time / len(df) > 0.01:
                quality_issues += 1
            logger.debug(f"Invalid delivery time count: {invalid_time}")

            # Check 5: Duplicates
            duplicates = df.duplicated().sum()
            df_dedup = df.drop_duplicates()
            if len(df_dedup) < len(df) * 0.95:
                quality_issues += 1
            logger.debug(f"Duplicate rows: {duplicates}")

            quality_score = 1 - (quality_issues / total_checks)
            logger.info(f"Data quality score: {quality_score:.2f}")
            return quality_score

        except Exception as e:
            logger.error(f"Error checking data quality: {e}")
            return 0.0

    def _prepare_features(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.Series]:
        """Prepare features for model training, including traffic-aware features."""
        df = df.copy()

        # Remove duplicates and invalid data
        df = df.drop_duplicates()
        df = df[(df["distance_km"] > 0) & (df["distance_km"] <= 200)]
        df = df[(df["actual_delivery_min"] > 1) & (df["actual_delivery_min"] <= 480)]
        df = df[(df["error_min"].abs() <= 60)]

        # Encode categorical features
        if "time_of_day" in df.columns:
            time_of_day_map = {
                "morning": 0,
                "afternoon": 1,
                "evening": 2,
                "night": 3,
            }
            df["time_of_day_encoded"] = df["time_of_day"].map(time_of_day_map).fillna(0)
        else:
            df["time_of_day_encoded"] = 0

        if "traffic_condition" in df.columns:
            traffic_map = {
                "free_flow": 0,
                "moderate": 1,
                "congested": 2,
                "heavy": 3,
            }
            df["traffic_encoded"] = df["traffic_condition"].map(traffic_map).fillna(1)
        else:
            df["traffic_encoded"] = 1

        # Add traffic-aware features
        try:
            if settings.TRAFFIC_API_ENABLED:
                logger.info("Enriching features with traffic data...")
                engineer = TrafficFeatureEngineer(db_session=self.db)
                
                # Run async traffic features in new event loop
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    df = loop.run_until_complete(
                        engineer.enrich_features_with_traffic(df)
                    )
                    logger.info("Successfully added traffic features")
                finally:
                    loop.close()
            else:
                logger.debug("Traffic API disabled, using default traffic features")
                # Default values when traffic API disabled
                df["current_traffic_ratio"] = 1.0
                df["historical_avg_traffic_same_hour"] = 1.0
                df["historical_std_traffic_same_hour"] = 0.1
                df["is_peak_hour"] = 0
                df["weather_severity"] = 0
                df["effective_travel_time_min"] = (df["distance_km"] / 30.0) * 60.0

        except Exception as e:
            logger.error(f"Error adding traffic features: {e}, using defaults")
            df["current_traffic_ratio"] = 1.0
            df["historical_avg_traffic_same_hour"] = 1.0
            df["historical_std_traffic_same_hour"] = 0.1
            df["is_peak_hour"] = 0
            df["weather_severity"] = 0
            df["effective_travel_time_min"] = (df["distance_km"] / 30.0) * 60.0

        # Feature columns (including traffic features)
        feature_cols = [
            "distance_km",
            "weight",
            "time_of_day_encoded",
            "day_of_week",
            "traffic_encoded",
            "current_traffic_ratio",
            "historical_avg_traffic_same_hour",
            "historical_std_traffic_same_hour",
            "is_peak_hour",
            "weather_severity",
            "effective_travel_time_min",
        ]

        # Filter to columns that exist in dataframe
        feature_cols = [col for col in feature_cols if col in df.columns]

        X = df[feature_cols].fillna(0)
        y = df["actual_delivery_min"]

        logger.info(
            f"Prepared {len(X)} samples with {len(feature_cols)} features "
            f"({len([c for c in feature_cols if 'traffic' in c or 'weather' in c or 'peak' in c or 'effective' in c])} traffic-aware features)"
        )
        return X, y

    def _train_and_evaluate(
        self,
        tenant_id: str,
        X_train: pd.DataFrame,
        X_test: pd.DataFrame,
        y_train: pd.Series,
        y_test: pd.Series,
        training_log: ModelTrainingLog,
    ) -> Optional[str]:
        """Train XGBoost model and evaluate."""
        try:
            logger.info("Training XGBoost model...")

            model = ETAPredictor(
                model_name=f"eta_predictor_{tenant_id}",
            )

            # Train
            model.train(X_train, y_train)

            # Evaluate
            metrics = model.evaluate(X_test, y_test)

            logger.info(f"Model metrics: {metrics}")

            # Store metrics in training log
            if "mae" in metrics:
                model.mae_test = float(metrics["mae"])
            if "rmse" in metrics:
                training_log.rmse_test = float(metrics["rmse"])
            if "r2" in metrics:
                training_log.r2_score = float(metrics["r2"])

            model_version = f"v_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"

            # Log to MLflow if available
            if self.mlflow_enabled:
                self._log_to_mlflow(
                    tenant_id,
                    model_version,
                    model,
                    metrics,
                    X_train,
                    X_test,
                )

            logger.info(f"Model trained: {model_version}")
            return model_version

        except Exception as e:
            logger.error(f"Error training model: {e}")
            return None

    def _log_to_mlflow(
        self,
        tenant_id: str,
        model_version: str,
        model: ETAPredictor,
        metrics: Dict[str, float],
        X_train: pd.DataFrame,
        X_test: pd.DataFrame,
    ) -> None:
        """Log model and metrics to MLflow."""
        try:
            mlflow.set_tracking_uri(settings.MLFLOW_TRACKING_URI)
            mlflow.set_experiment(f"eta_predictor_{tenant_id}")

            with mlflow.start_run(run_name=f"retrain_{model_version}") as run:
                # Log parameters
                mlflow.log_params(
                    {
                        "model_version": model_version,
                        "samples_train": len(X_train),
                        "samples_test": len(X_test),
                        "features": ",".join(X_train.columns),
                    }
                )

                # Log metrics
                for metric_name, value in metrics.items():
                    if isinstance(value, (int, float)):
                        mlflow.log_metric(metric_name, float(value))

                # Log model
                mlflow.sklearn.log_model(model.model, artifact_path="model")

                # Log training distribution as artifact for drift detection
                training_dist = {
                    f"{col}_mean": float(X_train[col].mean())
                    for col in X_train.columns
                }
                import json

                with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
                    json.dump(training_dist, f)
                    mlflow.log_artifact(f.name, artifact_path="training_distribution")

                logger.info(f"Logged to MLflow: {run.info.run_id}")

        except Exception as e:
            logger.error(f"Error logging to MLflow: {e}")

    def _compare_with_production(
        self, tenant_id: str, training_log: ModelTrainingLog
    ) -> Tuple[float, bool]:
        """
        Compare new model with production model.

        Returns:
            Tuple of (improvement_pct, should_promote_to_staging)
        """
        try:
            # Get production model
            prod_model = self.db.query(ModelRegistry).filter(
                ModelRegistry.tenant_id == tenant_id,
                ModelRegistry.stage == "production",
            ).order_by(ModelRegistry.created_at.desc()).first()

            if not prod_model:
                # First model, always promote
                logger.info("No production model found, promoting first model")
                return 0, True

            prod_mae = prod_model.mae_test
            new_mae = training_log.mae_test

            if not prod_mae or not new_mae:
                return 0, False

            # Improvement = negative is better (lower MAE)
            improvement = (new_mae - prod_mae) / prod_mae

            # Promote if new model is better (improvement < 0) or within threshold
            should_promote = improvement < MAE_IMPROVEMENT_THRESHOLD

            logger.info(
                f"Model comparison: prod_mae={prod_mae:.2f}, "
                f"new_mae={new_mae:.2f}, improvement={improvement:.2%}, "
                f"should_promote={should_promote}"
            )

            return improvement * 100, should_promote

        except Exception as e:
            logger.error(f"Error comparing with production model: {e}")
            return 0, False

    def _stage_model_for_ab_test(
        self, tenant_id: str, model_version: str, training_log: ModelTrainingLog
    ) -> None:
        """Register model as staging for A/B test."""
        try:
            # Get current production model for A/B test
            prod_model = self.db.query(ModelRegistry).filter(
                ModelRegistry.tenant_id == tenant_id,
                ModelRegistry.stage == "production",
            ).order_by(ModelRegistry.created_at.desc()).first()

            if not prod_model:
                # No production model, promote directly
                logger.warning("No production model for A/B test, promoting directly")
                self._promote_model(tenant_id, model_version)
                return

            # Register new model as staging
            new_model = ModelRegistry(
                tenant_id=tenant_id,
                model_version=model_version,
                stage="staging",
                mae_test=training_log.mae_test or 0,
                rmse_test=training_log.rmse_test,
                r2_score=training_log.r2_score,
                mlflow_run_id=training_log.run_id,
                is_production=False,
            )

            self.db.add(new_model)
            self.db.commit()

            logger.info(f"Model {model_version} staged for A/B test")

        except Exception as e:
            logger.error(f"Error staging model for A/B test: {e}")

    def _promote_model(self, tenant_id: str, model_version: str) -> None:
        """Promote model to production directly."""
        try:
            new_model = ModelRegistry(
                tenant_id=tenant_id,
                model_version=model_version,
                stage="production",
                mae_test=0,
                is_production=True,
                deployment_time=datetime.utcnow(),
            )

            self.db.add(new_model)
            self.db.commit()

            logger.info(f"Model {model_version} promoted to production")

        except Exception as e:
            logger.error(f"Error promoting model: {e}")

    def retrain_all_active_tenants(self) -> Dict[str, Any]:
        """Retrain models for all active tenants."""
        try:
            tenants = self.db.query(Tenant).all()
            results = {}

            for tenant in tenants:
                result = self.retrain_model(tenant.id)
                results[tenant.id] = result
                logger.info(f"Retrain result for {tenant.id}: {result['status']}")

            logger.info(f"Retraining completed for {len(tenants)} tenants")
            return results

        except Exception as e:
            logger.error(f"Error retraining all tenants: {e}")
            return {}
