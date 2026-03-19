"""
Driver familiarity scoring system.
Rates how familiar each driver is with specific delivery zones based on historical performance.
"""

import logging
from typing import Dict, Optional

import numpy as np
import redis
from sqlalchemy.orm import Session

from src.backend.app.db.models import DeliveryFeedback
from src.backend.app.core.config import settings

logger = logging.getLogger(__name__)

# Redis expiry: 7 days
FAMILIARITY_CACHE_TTL = 7 * 24 * 3600


class DriverFamiliarityScorer:
    """Computes and caches driver familiarity scores."""

    def __init__(self, db_session: Optional[Session] = None, redis_client: Optional[redis.Redis] = None):
        """Initialize scorer."""
        self.db = db_session
        self.redis_client = redis_client

        # Try to connect to Redis if available
        if not self.redis_client:
            try:
                self.redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
                self.redis_client.ping()
            except Exception:
                logger.debug("Redis not available, using in-memory cache only")
                self.redis_client = None

    def get_driver_zone_familiarity(self, driver_id: str, zone_id: str) -> float:
        """
        Get familiarity score for driver in specific zone.

        Score computation:
        - 0.0: Driver has never delivered in this zone (or very few deliveries)
        - 0.5: Driver has moderate history, average error
        - 1.0: Driver has many deliveries, consistently beating predictions

        Args:
            driver_id: Driver ID
            zone_id: Delivery zone ID (discretized lat/lng)

        Returns:
            Familiarity score 0.0-1.0
        """
        # Try Redis cache first
        cache_key = f"driver:{driver_id}:familiarity:{zone_id}"
        if self.redis_client:
            try:
                cached = self.redis_client.get(cache_key)
                if cached:
                    return float(cached)
            except Exception as e:
                logger.debug(f"Redis cache miss: {e}")

        # Compute score from database
        if not self.db:
            logger.debug(f"No DB session, returning default familiarity")
            return 0.5

        score = self._compute_familiarity_from_db(driver_id, zone_id)

        # Store in cache
        if self.redis_client:
            try:
                self.redis_client.setex(cache_key, FAMILIARITY_CACHE_TTL, str(score))
            except Exception as e:
                logger.debug(f"Failed to cache familiarity: {e}")

        return score

    def _compute_familiarity_from_db(self, driver_id: str, zone_id: str) -> float:
        """Compute familiarity from historical feedback."""
        try:
            # Query deliveries for this driver in this zone
            deliveries = self.db.query(DeliveryFeedback).filter(
                DeliveryFeedback.driver_id == driver_id,
                # Note: zone matching would need to be added to the query
                # For now, we'll match on a zone_encoded column if it exists
                # Or compute zone from lat/lng if available
            ).all()

            if not deliveries:
                # No history in this zone
                return 0.3

            # Filter to deliveries with actual delivery time (completed)
            completed = [
                d
                for d in deliveries
                if d.actual_delivery_min is not None and d.error_min is not None
            ]

            if len(completed) < 3:
                # Too few deliveries to establish familiarity
                return 0.4 + (len(completed) * 0.1)  # Slight boost for any history

            # Compute familiar score based on prediction accuracy
            # Better predictions = higher familiarity
            errors = [abs(d.error_min) for d in completed]
            mean_error = np.mean(errors)
            std_error = np.std(errors)

            # Score formula:
            # - Low mean error (consistent predictions) = high score
            # - High mean error (inconsistent predictions) = low score
            # - Low std error (predictable performance) = bonus
            # - High std error (variable performance) = penalty

            base_score = 0.5
            error_penalty = (mean_error / 10.0) * 0.4  # Max -0.4 for high error
            count_bonus = min((len(completed) / 20.0) * 0.3, 0.3)  # Max +0.3 for more data
            std_bonus = (1.0 / (1.0 + std_error / 5.0)) * 0.2  # Consistency bonus

            score = base_score - error_penalty + count_bonus + std_bonus
            return max(0.1, min(1.0, score))  # Clamp to [0.1, 1.0]

        except Exception as e:
            logger.error(f"Error computing driver familiarity: {e}")
            return 0.5

    def update_batch_familiarity(self, batch_delivery_feedbacks: list) -> Dict[str, float]:
        """
        Update familiarity scores for a batch of feedback records.

        Useful for Celery task to recompute and cache scores after deliveries complete.
        """
        updated_scores = {}

        for feedback in batch_delivery_feedbacks:
            if not feedback.driver_id or not feedback.actual_delivery_min:
                continue

            # Extract zone from feedback (would need zone_id to be stored)
            # For now, use a dummy zone based on some bucketing
            zone_id = self._extract_zone_id(feedback)

            score = self._compute_familiarity_from_db(feedback.driver_id, zone_id)
            cache_key = f"driver:{feedback.driver_id}:familiarity:{zone_id}"
            updated_scores[cache_key] = score

            if self.redis_client:
                try:
                    self.redis_client.setex(cache_key, FAMILIARITY_CACHE_TTL, str(score))
                except Exception as e:
                    logger.debug(f"Failed to update familiarity cache: {e}")

        return updated_scores

    def _extract_zone_id(self, feedback) -> str:
        """Extract zone ID from feedback record."""
        # This would be implemented based on your zone discretization logic
        # For now, return a placeholder
        return "zone_unknown"

    def get_multi_zone_familiarity(self, driver_id: str, zone_ids: list) -> Dict[str, float]:
        """Get familiarity scores for driver in multiple zones efficiently."""
        scores = {}
        for zone_id in zone_ids:
            scores[zone_id] = self.get_driver_zone_familiarity(driver_id, zone_id)
        return scores

    def clear_driver_cache(self, driver_id: str, zone_id: Optional[str] = None) -> bool:
        """Clear cached familiarity score for driver (optionally specific zone)."""
        if not self.redis_client:
            return True

        try:
            if zone_id:
                cache_key = f"driver:{driver_id}:familiarity:{zone_id}"
                self.redis_client.delete(cache_key)
            else:
                # Clear all zones for this driver
                pattern = f"driver:{driver_id}:familiarity:*"
                keys = self.redis_client.keys(pattern)
                if keys:
                    self.redis_client.delete(*keys)
            return True
        except Exception as e:
            logger.error(f"Failed to clear familiarity cache: {e}")
            return False
