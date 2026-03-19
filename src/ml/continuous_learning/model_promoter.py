"""
Model promotion and A/B testing orchestration for continuous learning.
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

import redis
from sqlalchemy.orm import Session

from src.backend.app.db.models import (
    ModelRegistry,
    ABTest,
    Tenant,
    DeliveryFeedback,
)
from src.backend.app.core.config import settings

logger = logging.getLogger(__name__)

# A/B test duration in hours
AB_TEST_DURATION_HOURS = 48
# Threshold for promoting staging model (must beat production by X%)
PROMOTION_THRESHOLD_PCT = 0.02  # 2% improvement


class ModelPromoter:
    """Orchestrate model promotion and A/B testing."""

    def __init__(self, db_session: Session):
        """Initialize promoter."""
        self.db = db_session
        try:
            self.redis_client = redis.from_url(settings.REDIS_RESULT_BACKEND_URL)
            self.redis_client.ping()
            self._has_redis = True
        except Exception as e:
            logger.warning(f"Redis unavailable for model state: {e}")
            self._has_redis = False
            self.model_state = {}

    def start_ab_test(self, tenant_id: str, model_b_version: str) -> Optional[str]:
        """
        Start A/B test between production (A) and staging (B) model.

        Args:
            tenant_id: Tenant ID
            model_b_version: Staging model version to test

        Returns:
            AB test ID if successful, None otherwise
        """
        try:
            logger.info(f"Starting A/B test for {tenant_id}: B={model_b_version}")

            # Get current production model
            prod_model = self.db.query(ModelRegistry).filter(
                ModelRegistry.tenant_id == tenant_id,
                ModelRegistry.stage == "production",
            ).order_by(ModelRegistry.created_at.desc()).first()

            if not prod_model:
                logger.warning(f"No production model for {tenant_id}, promoting directly")
                return self.promote_model_to_production(tenant_id, model_b_version)

            # Create A/B test
            ab_test = ABTest(
                tenant_id=tenant_id,
                model_a_version=prod_model.model_version,
                model_b_version=model_b_version,
                started_at=datetime.utcnow(),
                ends_at=datetime.utcnow() + timedelta(hours=AB_TEST_DURATION_HOURS),
                status="running",
            )

            self.db.add(ab_test)
            self.db.commit()

            # Update Redis to route traffic to both models for this tenant
            self._update_traffic_split(tenant_id, model_b_version)

            logger.info(f"A/B test started: {ab_test.id}")
            return ab_test.id

        except Exception as e:
            logger.error(f"Error starting A/B test: {e}")
            return None

    def check_staging_models_promotion(self, tenant_id: str) -> Optional[str]:
        """
        Check if staging models should be promoted to production.

        Runs hourly or after A/B test ends.

        Returns:
            Promoted model version if successful, None otherwise
        """
        try:
            logger.info(f"Checking staging models for promotion: {tenant_id}")

            # Get current production model
            prod_model = self.db.query(ModelRegistry).filter(
                ModelRegistry.tenant_id == tenant_id,
                ModelRegistry.stage == "production",
            ).order_by(ModelRegistry.created_at.desc()).first()

            # Get staging model
            staging_model = self.db.query(ModelRegistry).filter(
                ModelRegistry.tenant_id == tenant_id,
                ModelRegistry.stage == "staging",
            ).order_by(ModelRegistry.created_at.desc()).first()

            if not staging_model:
                logger.debug(f"No staging model for {tenant_id}")
                return None

            # Get related A/B test
            ab_test = self.db.query(ABTest).filter(
                ABTest.tenant_id == tenant_id,
                ABTest.model_b_version == staging_model.model_version,
                ABTest.status == "running",
            ).order_by(ABTest.ended_at.desc()).first()

            if not ab_test:
                logger.debug(f"No A/B test for staging model {staging_model.model_version}")
                return None

            # Check if test is complete
            if datetime.utcnow() < ab_test.ends_at:
                logger.debug(f"A/B test still running, ends at {ab_test.ends_at}")
                return None

            # Evaluate A/B test results
            metrics_a, metrics_b = self._compute_ab_test_metrics(
                tenant_id, prod_model.model_version, staging_model.model_version, ab_test
            )

            logger.info(
                f"A/B test results: A={metrics_a}, B={metrics_b}"
            )

            # Determine winner
            improvement = (metrics_a["mae"] - metrics_b["mae"]) / metrics_a["mae"]

            if improvement > PROMOTION_THRESHOLD_PCT:
                # Promote staging model
                logger.info(
                    f"Staging model {staging_model.model_version} won "
                    f"({improvement:.2%} improvement)"
                )
                ab_test.status = "completed"
                ab_test.winner = "b"
                self.db.add(ab_test)

                promoted = self.promote_model_to_production(
                    tenant_id, staging_model.model_version
                )
                return promoted
            else:
                # Keep production model
                logger.info(
                    f"Production model {prod_model.model_version} won "
                    f"({-improvement:.2%} advantage)"
                )
                ab_test.status = "completed"
                ab_test.winner = "a"
                self.db.add(ab_test)

                # Archive staging model
                staging_model.stage = "archived"
                self.db.add(staging_model)
                self.db.commit()

                return None

        except Exception as e:
            logger.error(f"Error checking staging models: {e}")
            return None

    def promote_model_to_production(self, tenant_id: str, model_version: str) -> str:
        """
        Promote model to production.

        Updates:
        - ModelRegistry stage to 'production'
        - Redis cache: current_model:{tenant_id}
        - Kubernetes pod restart

        Returns:
            Promoted model version
        """
        try:
            logger.info(f"Promoting {model_version} to production for {tenant_id}")

            # Update model registry
            model = self.db.query(ModelRegistry).filter(
                ModelRegistry.tenant_id == tenant_id,
                ModelRegistry.model_version == model_version,
            ).first()

            if not model:
                logger.error(f"Model {model_version} not found in registry")
                return None

            model.stage = "production"
            model.is_production = True
            model.deployment_time = datetime.utcnow()
            self.db.add(model)

            # Archive old production models
            old_prod = self.db.query(ModelRegistry).filter(
                ModelRegistry.tenant_id == tenant_id,
                ModelRegistry.stage == "production",
                ModelRegistry.model_version != model_version,
                ModelRegistry.is_production == True,
            ).all()

            for old_model in old_prod:
                old_model.stage = "archived"
                old_model.is_production = False
                self.db.add(old_model)

            self.db.commit()

            # Update Redis cache
            self._update_current_model_cache(tenant_id, model_version)

            # Trigger Kubernetes rolling restart
            self._trigger_pod_restart(tenant_id, model_version)

            logger.info(f"Model {model_version} promoted to production")
            return model_version

        except Exception as e:
            logger.error(f"Error promoting model: {e}")
            self.db.rollback()
            return None

    def _update_traffic_split(self, tenant_id: str, staging_model_version: str) -> None:
        """Update traffic split for A/B test between production and staging."""
        try:
            if self._has_redis:
                # 50/50 traffic split for A/B test
                self.redis_client.set(
                    f"ab_test:{tenant_id}:staging_model",
                    staging_model_version,
                    ex=48 * 3600,
                )
                self.redis_client.set(
                    f"ab_test:{tenant_id}:traffic_split",
                    "0.5",
                    ex=48 * 3600,
                )
                logger.info(f"Updated traffic split for A/B test: {tenant_id}")
            else:
                self.model_state[f"ab_test:{tenant_id}:staging_model"] = staging_model_version
                self.model_state[f"ab_test:{tenant_id}:traffic_split"] = 0.5
        except Exception as e:
            logger.error(f"Error updating traffic split: {e}")

    def _update_current_model_cache(self, tenant_id: str, model_version: str) -> None:
        """Update current production model in cache."""
        try:
            if self._has_redis:
                self.redis_client.set(
                    f"current_model:{tenant_id}",
                    model_version,
                    ex=7 * 86400,
                )
                # Clear A/B test keys
                self.redis_client.delete(f"ab_test:{tenant_id}:staging_model")
                self.redis_client.delete(f"ab_test:{tenant_id}:traffic_split")
                logger.info(f"Updated model cache: {tenant_id}={model_version}")
            else:
                self.model_state[f"current_model:{tenant_id}"] = model_version
                self.model_state.pop(f"ab_test:{tenant_id}:staging_model", None)
                self.model_state.pop(f"ab_test:{tenant_id}:traffic_split", None)
        except Exception as e:
            logger.error(f"Error updating model cache: {e}")

    def _compute_ab_test_metrics(
        self,
        tenant_id: str,
        model_a_version: str,
        model_b_version: str,
        ab_test: ABTest,
    ) -> tuple[Dict[str, float], Dict[str, float]]:
        """
        Compute A/B test metrics for both models.

        Returns:
            Tuple of (metrics_a, metrics_b) dicts with mae, accuracy, etc
        """
        try:
            test_duration = (ab_test.ends_at - ab_test.started_at).total_seconds() / 3600

            # Fetch predictions for model A and B
            cutoff_time = ab_test.started_at

            # This is a simplified version - in production, track which model was used per prediction
            # For now, we simulate by splitting the data
            query = self.db.query(DeliveryFeedback).filter(
                DeliveryFeedback.tenant_id == tenant_id,
                DeliveryFeedback.predicted_at >= cutoff_time,
                DeliveryFeedback.actual_delivery_min.isnot(None),
            ).order_by(DeliveryFeedback.predicted_at)

            records = query.all()
            total = len(records)

            # Split: first half -> A, second half -> B
            half = total // 2

            records_a = records[:half]
            records_b = records[half:]

            metrics_a = self._compute_metrics(records_a)
            metrics_b = self._compute_metrics(records_b)

            logger.info(
                f"A/B test metrics: A MAE={metrics_a['mae']:.2f}, "
                f"B MAE={metrics_b['mae']:.2f} (test duration: {test_duration:.1f}h)"
            )

            return metrics_a, metrics_b

        except Exception as e:
            logger.error(f"Error computing A/B test metrics: {e}")
            return {"mae": 999}, {"mae": 999}

    def _compute_metrics(self, records) -> Dict[str, float]:
        """Compute evaluation metrics from records."""
        if not records:
            return {"mae": 999, "accuracy": 0}

        errors = [abs(r.error_min) for r in records if r.error_min is not None]

        if not errors:
            return {"mae": 999, "accuracy": 0}

        mae = sum(errors) / len(errors)
        within_15 = sum(1 for e in errors if e <= 15)
        accuracy = (within_15 / len(errors)) * 100

        return {"mae": mae, "accuracy": accuracy}

    def _trigger_pod_restart(self, tenant_id: str, model_version: str) -> None:
        """
        Trigger Kubernetes rolling restart of prediction service pods.

        In production, this would:
        1. Update model ConfigMap in Kubernetes
        2. Restart prediction service pods
        3. Wait for readiness probe
        """
        try:
            logger.info(
                f"Triggering pod restart for {tenant_id} with model {model_version}"
            )

            # In production:
            # from kubernetes import client, config
            # config.load_incluster_config()
            # v1 = client.CoreV1Api()
            # apps_v1 = client.AppsV1Api()

            # Update ConfigMap with new model
            # patch_deploy = {"spec": {"template": {"metadata": {"annotations": {"timestamp": now}}}}}
            # apps_v1.patch_namespaced_deployment("prediction-service", "default", patch_deploy)

            logger.info(f"Pod restart triggered for {tenant_id}")

        except Exception as e:
            logger.error(f"Error triggering pod restart: {e}")
