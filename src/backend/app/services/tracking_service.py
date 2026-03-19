"""Redis Geo operations for driver position tracking."""

import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import redis
from redis import Redis

from src.backend.app.core.config import settings
from src.backend.app.schemas.tracking import DriverPositionUpdate

logger = logging.getLogger(__name__)


class RedisGeoTracker:
    """Manages driver position tracking using Redis Geo commands."""

    def __init__(self, redis_url: str = settings.REDIS_FEATURE_STORE_URL):
        """Initialize Redis connection pool."""
        self.redis: Redis = redis.from_url(
            redis_url,
            decode_responses=True,
            connection_pool=redis.ConnectionPool.from_url(
                redis_url,
                max_connections=50,
                decode_responses=True,
            ),
        )
        self.position_ttl = 120  # seconds
        self.active_driver_ttl = 3600  # seconds

    def store_position(
        self, tenant_id: str, position: DriverPositionUpdate
    ) -> bool:
        """Store driver position in Redis Geo and hash."""
        try:
            geo_key = f"positions:{tenant_id}"
            hash_key = f"driver:{position.driver_id}:position"

            # GEOADD to sorted set for geo queries
            self.redis.geoadd(
                geo_key,
                mapping={position.driver_id: (position.longitude, position.latitude)},
            )

            # Store full position data in hash with TTL
            position_data = {
                "latitude": position.latitude,
                "longitude": position.longitude,
                "speed_kmh": position.speed_kmh,
                "heading_degrees": position.heading_degrees,
                "timestamp": position.timestamp.isoformat(),
                "accuracy_meters": position.accuracy_meters or 0,
            }

            pipe = self.redis.pipeline()
            pipe.hset(hash_key, mapping=position_data)
            pipe.expire(hash_key, self.position_ttl)
            pipe.sadd(f"active_drivers:{tenant_id}", position.driver_id)
            pipe.expire(f"active_drivers:{tenant_id}", self.active_driver_ttl)
            pipe.execute()

            logger.debug(
                f"Stored position for driver {position.driver_id} at "
                f"({position.latitude}, {position.longitude})"
            )
            return True
        except Exception as e:
            logger.error(f"Failed to store position: {e}")
            return False

    def find_nearby_drivers(
        self, tenant_id: str, latitude: float, longitude: float, radius_km: float
    ) -> List[Dict[str, Any]]:
        """Find all drivers within radius using GEORADIUS."""
        try:
            geo_key = f"positions:{tenant_id}"

            # GEORADIUS returns list of members within radius
            result = self.redis.georadius(
                geo_key,
                longitude,
                latitude,
                radius_km,
                unit="km",
                withdist=True,
                withcoord=True,
            )

            nearby = []
            now = datetime.utcnow()

            for item in result:
                driver_id = item[0]
                distance_km = float(item[1])
                coords = item[2]

                # Get last position timestamp
                position_hash = self.redis.hgetall(f"driver:{driver_id}:position")
                if not position_hash:
                    continue

                timestamp_str = position_hash.get("timestamp", "")
                try:
                    timestamp = datetime.fromisoformat(timestamp_str)
                    last_seen_ago = (now - timestamp).total_seconds()
                    if last_seen_ago > 60:  # Skip if position older than 60s
                        continue
                except (ValueError, TypeError):
                    last_seen_ago = 0

                nearby.append(
                    {
                        "driver_id": driver_id,
                        "latitude": float(coords[1]),
                        "longitude": float(coords[0]),
                        "distance_km": round(distance_km, 2),
                        "last_seen_seconds_ago": int(last_seen_ago),
                        "status": "active",
                    }
                )

            logger.debug(f"Found {len(nearby)} drivers near ({latitude}, {longitude})")
            return nearby
        except Exception as e:
            logger.error(f"Failed to find nearby drivers: {e}")
            return []

    def get_driver_position(self, driver_id: str) -> Optional[Dict[str, Any]]:
        """Get latest position for a driver."""
        try:
            hash_key = f"driver:{driver_id}:position"
            position_data = self.redis.hgetall(hash_key)

            if not position_data:
                return None

            return {
                "driver_id": driver_id,
                "latitude": float(position_data.get("latitude", 0)),
                "longitude": float(position_data.get("longitude", 0)),
                "speed_kmh": float(position_data.get("speed_kmh", 0)),
                "heading_degrees": float(position_data.get("heading_degrees", 0)),
                "timestamp": position_data.get("timestamp"),
                "accuracy_meters": float(position_data.get("accuracy_meters", 0)),
            }
        except Exception as e:
            logger.error(f"Failed to get driver position: {e}")
            return None

    def get_all_active_drivers(self, tenant_id: str) -> List[Dict[str, Any]]:
        """Get all currently active drivers for tenant."""
        try:
            active_set = f"active_drivers:{tenant_id}"
            driver_ids = self.redis.smembers(active_set)

            drivers = []
            for driver_id in driver_ids:
                position = self.get_driver_position(driver_id)
                if position:
                    drivers.append(position)

            return drivers
        except Exception as e:
            logger.error(f"Failed to get active drivers: {e}")
            return []

    def publish_position_update(self, tenant_id: str, position: DriverPositionUpdate) -> bool:
        """Publish position update to Redis pub/sub."""
        try:
            channel = f"position_updates:{tenant_id}"
            message = {
                "driver_id": position.driver_id,
                "latitude": position.latitude,
                "longitude": position.longitude,
                "speed_kmh": position.speed_kmh,
                "heading_degrees": position.heading_degrees,
                "timestamp": position.timestamp.isoformat(),
            }
            self.redis.publish(channel, json.dumps(message))
            return True
        except Exception as e:
            logger.error(f"Failed to publish position update: {e}")
            return False

    def set_driver_deviation(self, driver_id: str, deviation: bool, ttl: int = 300):
        """Set driver deviation flag."""
        try:
            key = f"driver:{driver_id}:deviation"
            if deviation:
                self.redis.setex(key, ttl, "true")
            else:
                self.redis.delete(key)
            return True
        except Exception as e:
            logger.error(f"Failed to set deviation flag: {e}")
            return False

    def get_driver_deviation(self, driver_id: str) -> bool:
        """Check if driver has deviation flag."""
        try:
            key = f"driver:{driver_id}:deviation"
            return self.redis.exists(key) > 0
        except Exception as e:
            logger.error(f"Failed to get deviation flag: {e}")
            return False

    def increment_deviation_count(self, driver_id: str) -> int:
        """Increment consecutive deviation count."""
        try:
            key = f"driver:{driver_id}:deviation_count"
            count = self.redis.incr(key)
            self.redis.expire(key, 600)  # Reset after 10 minutes
            return count
        except Exception as e:
            logger.error(f"Failed to increment deviation count: {e}")
            return 0

    def reset_deviation_count(self, driver_id: str) -> bool:
        """Reset deviation count to zero."""
        try:
            key = f"driver:{driver_id}:deviation_count"
            self.redis.delete(key)
            return True
        except Exception as e:
            logger.error(f"Failed to reset deviation count: {e}")
            return False

    def store_route_geometry(
        self, driver_id: str, route_id: str, geometry: List[Tuple[float, float]]
    ) -> bool:
        """Store route geometry as JSON for deviation detection."""
        try:
            key = f"route:{route_id}:geometry"
            # Store as list of [lon, lat] tuples
            geometry_json = json.dumps(geometry)
            self.redis.set(key, geometry_json, ex=86400)  # 24 hour TTL
            
            # Also map driver to route
            self.redis.set(f"driver:{driver_id}:current_route", route_id, ex=86400)
            return True
        except Exception as e:
            logger.error(f"Failed to store route geometry: {e}")
            return False

    def get_route_geometry(self, route_id: str) -> Optional[List[Tuple[float, float]]]:
        """Get stored route geometry."""
        try:
            key = f"route:{route_id}:geometry"
            geometry_json = self.redis.get(key)
            if geometry_json:
                return json.loads(geometry_json)
            return None
        except Exception as e:
            logger.error(f"Failed to get route geometry: {e}")
            return None

    def get_driver_current_route(self, driver_id: str) -> Optional[str]:
        """Get driver's current route ID."""
        try:
            key = f"driver:{driver_id}:current_route"
            return self.redis.get(key)
        except Exception as e:
            logger.error(f"Failed to get driver current route: {e}")
            return None

    def close(self):
        """Close Redis connection pool."""
        try:
            self.redis.close()
        except Exception as e:
            logger.error(f"Failed to close Redis connection: {e}")


# Global instance
_tracker: Optional[RedisGeoTracker] = None


def get_geo_tracker() -> RedisGeoTracker:
    """Get or create Redis Geo tracker instance."""
    global _tracker
    if _tracker is None:
        _tracker = RedisGeoTracker()
    return _tracker
