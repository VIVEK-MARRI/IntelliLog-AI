"""
Traffic data caching layer with Redis and PostgreSQL fallback.
Caches real-time and historical traffic data.
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple

import redis
from sqlalchemy.orm import Session

from src.backend.app.core.config import settings
from src.ml.features.traffic_client import LatLon, TrafficData

logger = logging.getLogger(__name__)


class TrafficCache:
    """Cache traffic data with Redis primary, PostgreSQL fallback."""

    # Cache TTLs
    TTL_LIVE = 15 * 60  # 15 minutes for real-time data
    TTL_HISTORICAL = 24 * 3600  # 24 hours for historical averages

    def __init__(self, db_session: Session = None):
        """Initialize cache."""
        self.db = db_session
        try:
            self.redis_client = redis.from_url(settings.REDIS_FEATURE_STORE_URL)
            self.redis_client.ping()
            self._has_redis = True
        except Exception as e:
            logger.warning(f"Redis unavailable for traffic cache: {e}")
            self._has_redis = False
            self.memory_cache = {}

    def _get_zone_id(self, lat: float, lng: float) -> str:
        """
        Get zone ID from coordinates.
        Simplified: discretize to 1km grid cells.
        """
        # Rough: 1 degree ≈ 111 km
        # So 1 km ≈ 0.009 degrees
        zone_lat = int(lat / 0.009) * 0.009
        zone_lng = int(lng / 0.009) * 0.009
        return f"{zone_lat:.3f}_{zone_lng:.3f}"

    def _build_cache_key(
        self,
        origin_zone: str,
        dest_zone: str,
        weekday: int,
        hour: int,
        cache_type: str = "live",
    ) -> str:
        """Build cache key for traffic data."""
        return f"traffic:{cache_type}:{origin_zone}:{dest_zone}:{weekday}:{hour}"

    async def get_cached_travel_time(
        self, origin: LatLon, destination: LatLon
    ) -> Dict[str, Any]:
        """
        Get cached travel time with fallback.

        Returns:
            {
                travel_time_min: float,
                traffic_ratio: float,
                distance_meters: float,
                source: 'live' | 'cached' | 'historical'
            }
        """
        now = datetime.utcnow()
        origin_zone = self._get_zone_id(origin.lat, origin.lng)
        dest_zone = self._get_zone_id(destination.lat, destination.lng)

        # Try live cache (15 min TTL)
        live_key = self._build_cache_key(
            origin_zone, dest_zone, now.weekday(), now.hour, "live"
        )

        result = await self._get_from_redis(live_key)
        if result:
            result["source"] = "cached"
            logger.debug(f"Cache hit (live): {live_key}")
            return result

        # Try historical cache (24 hour TTL)
        hist_key = self._build_cache_key(
            origin_zone, dest_zone, now.weekday(), now.hour, "historical"
        )

        result = await self._get_from_redis(hist_key)
        if result:
            result["source"] = "historical"
            logger.debug(f"Cache hit (historical): {hist_key}")
            return result

        # Fallback to database historical average
        result = await self._get_from_db(
            origin_zone, dest_zone, now.weekday(), now.hour
        )
        if result:
            result["source"] = "historical"
            logger.debug(f"Fallback to database: {origin_zone} -> {dest_zone}")
            return result

        # No cache available
        logger.warning(
            f"No cache for {origin_zone} -> {dest_zone} "
            f"weekday={now.weekday()} hour={now.hour}"
        )
        return None

    async def set_live_traffic(
        self,
        origin: LatLon,
        destination: LatLon,
        traffic_data: TrafficData,
    ) -> None:
        """Set live traffic data in cache."""
        now = datetime.utcnow()
        origin_zone = self._get_zone_id(origin.lat, origin.lng)
        dest_zone = self._get_zone_id(destination.lat, destination.lng)

        cache_key = self._build_cache_key(
            origin_zone, dest_zone, now.weekday(), now.hour, "live"
        )

        cache_value = {
            "travel_time_min": traffic_data.duration_in_traffic_seconds / 60.0,
            "traffic_ratio": traffic_data.traffic_ratio,
            "distance_meters": traffic_data.distance_meters,
            "timestamp": now.isoformat(),
        }

        await self._set_in_redis(cache_key, cache_value, self.TTL_LIVE)
        logger.debug(f"Cached live traffic: {cache_key}")

    async def _get_from_redis(self, key: str) -> Optional[Dict[str, Any]]:
        """Get value from Redis."""
        if not self._has_redis:
            return self.memory_cache.get(key)

        try:
            value = self.redis_client.get(key)
            if value:
                return json.loads(value)
            return None
        except Exception as e:
            logger.error(f"Redis get error: {e}")
            return None

    async def _set_in_redis(self, key: str, value: Dict[str, Any], ttl: int) -> None:
        """Set value in Redis."""
        if not self._has_redis:
            self.memory_cache[key] = value
            return

        try:
            self.redis_client.setex(key, ttl, json.dumps(value))
        except Exception as e:
            logger.error(f"Redis set error: {e}")

    async def _get_from_db(
        self, origin_zone: str, dest_zone: str, weekday: int, hour: int
    ) -> Optional[Dict[str, Any]]:
        """Get historical average from database."""
        if not self.db:
            return None

        try:
            from src.backend.app.db.models import TrafficPattern

            pattern = self.db.query(TrafficPattern).filter(
                TrafficPattern.zone_origin == origin_zone,
                TrafficPattern.zone_dest == dest_zone,
                TrafficPattern.weekday == weekday,
                TrafficPattern.hour == hour,
            ).first()

            if pattern:
                return {
                    "travel_time_min": pattern.avg_travel_time_min,
                    "traffic_ratio": pattern.avg_traffic_ratio,
                    "distance_meters": pattern.avg_distance_meters,
                    "std_traffic_ratio": pattern.std_traffic_ratio,
                }

            return None

        except Exception as e:
            logger.error(f"Database query error: {e}")
            return None

    def clear_cache(self, older_than: timedelta = None) -> int:
        """Clear old cache entries. Returns count cleared."""
        if not self._has_redis:
            if older_than:
                # Clear memory cache (simplified)
                self.memory_cache.clear()
            return len(self.memory_cache)

        try:
            # Find and delete old keys
            pattern = "traffic:live:*"
            cursor = 0
            deleted = 0

            while True:
                cursor, keys = self.redis_client.scan(
                    cursor, match=pattern, count=100
                )
                for key in keys:
                    ttl = self.redis_client.ttl(key)
                    if ttl == -1:  # No expiry
                        self.redis_client.delete(key)
                        deleted += 1

                if cursor == 0:
                    break

            logger.info(f"Cleared {deleted} cache entries")
            return deleted

        except Exception as e:
            logger.error(f"Cache clear error: {e}")
            return 0


class TrafficCacheManager:
    """Manages traffic caching for batch operations."""

    def __init__(self, db_session: Session = None):
        """Initialize manager."""
        self.cache = TrafficCache(db_session)
        self.db = db_session

    async def populate_cache_for_zone_pair(
        self,
        origin_zone: str,
        dest_zone: str,
        traffic_data: Dict[int, Dict[int, Any]],  # hour -> traffic_data
    ) -> int:
        """Populate cache for a zone pair across multiple hours."""
        count = 0

        try:
            for hour, data in traffic_data.items():
                if not data:
                    continue

                for weekday in range(7):
                    cache_key = f"traffic:live:{origin_zone}:{dest_zone}:{weekday}:{hour}"
                    await self.cache._set_in_redis(
                        cache_key, data, self.cache.TTL_LIVE
                    )
                    count += 1

            logger.info(f"Populated cache for {origin_zone}->{dest_zone}: {count} entries")
            return count

        except Exception as e:
            logger.error(f"Error populating cache: {e}")
            return 0

    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        if not self.cache._has_redis:
            return {"cache_type": "memory", "entries": len(self.cache.memory_cache)}

        try:
            info = self.cache.redis_client.info()
            cursor = 0
            traffic_keys = 0

            while True:
                cursor, keys = self.cache.redis_client.scan(
                    cursor, match="traffic:*", count=100
                )
                traffic_keys += len(keys)
                if cursor == 0:
                    break

            return {
                "cache_type": "redis",
                "traffic_keys": traffic_keys,
                "memory_usage_mb": info.get("used_memory", 0) / 1024 / 1024,
                "hit_rate": "N/A",  # Would track in actual implementation
            }

        except Exception as e:
            logger.error(f"Error getting cache stats: {e}")
            return {"error": str(e)}
