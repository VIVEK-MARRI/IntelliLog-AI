"""
Redis-Backed Feature Store
Stores pre-computed features with versioning, metadata, and TTL
"""

import json
import hashlib
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
import redis
from pydantic import BaseModel
import pandas as pd
import numpy as np


class FeatureMetadata(BaseModel):
    """Metadata for stored features"""
    feature_names: List[str]
    created_at: datetime
    version: str
    entity_id: str
    ttl_hours: int
    checksum: str


class FeatureStore:
    """
    Redis-backed feature store for caching computed features
    
    Features:
    - Versioned storage
    - TTL management
    - Metadata tracking
    - Freshness detection
    - Atomic updates
    """
    
    def __init__(
        self, 
        redis_url: str = "redis://localhost:6379/0",
        default_ttl_hours: int = 6,
        key_prefix: str = "feature_store:"
    ):
        """Initialize feature store with Redis connection"""
        self.redis_client = redis.from_url(redis_url, decode_responses=True)
        self.default_ttl_hours = default_ttl_hours
        self.key_prefix = key_prefix
    
    def _generate_key(self, entity_id: str, version: str = "v1") -> str:
        """Generate Redis key for entity"""
        return f"{self.key_prefix}{version}:{entity_id}"
    
    def _compute_checksum(self, features: Dict[str, Any]) -> str:
        """Compute SHA256 checksum for feature integrity"""
        # Sort keys for consistent hashing
        feature_str = json.dumps(features, sort_keys=True)
        return hashlib.sha256(feature_str.encode()).hexdigest()
    
    def store_features(
        self,
        entity_id: str,
        features: Dict[str, Any],
        version: str = "v1",
        ttl_hours: Optional[int] = None
    ) -> bool:
        """
        Store features for an entity with metadata
        
        Args:
            entity_id: Unique identifier (e.g., order_id, delivery_id)
            features: Dictionary of feature_name -> value
            version: Feature version (for A/B testing)
            ttl_hours: Time-to-live in hours (default: 6)
        
        Returns:
            True if stored successfully
        """
        ttl = ttl_hours or self.default_ttl_hours
        key = self._generate_key(entity_id, version)
        
        # Create metadata
        metadata = FeatureMetadata(
            feature_names=list(features.keys()),
            created_at=datetime.utcnow(),
            version=version,
            entity_id=entity_id,
            ttl_hours=ttl,
            checksum=self._compute_checksum(features)
        )
        
        # Store features and metadata as separate keys
        feature_key = f"{key}:features"
        metadata_key = f"{key}:metadata"
        
        # Convert numpy types to native Python for JSON serialization
        serializable_features = {}
        for k, v in features.items():
            if isinstance(v, (np.integer, np.floating)):
                serializable_features[k] = float(v)
            elif isinstance(v, np.ndarray):
                serializable_features[k] = v.tolist()
            else:
                serializable_features[k] = v
        
        # Store in Redis with TTL
        ttl_seconds = ttl * 3600
        pipeline = self.redis_client.pipeline()
        pipeline.setex(feature_key, ttl_seconds, json.dumps(serializable_features))
        pipeline.setex(metadata_key, ttl_seconds, metadata.model_dump_json())
        pipeline.execute()
        
        return True
    
    def get_features(
        self,
        entity_id: str,
        version: str = "v1",
        validate_freshness: bool = True,
        max_age_hours: int = 6
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieve features for an entity
        
        Args:
            entity_id: Unique identifier
            version: Feature version
            validate_freshness: Check if features are fresh
            max_age_hours: Maximum age threshold
        
        Returns:
            Dict of features or None if not found/stale
        """
        key = self._generate_key(entity_id, version)
        feature_key = f"{key}:features"
        metadata_key = f"{key}:metadata"
        
        # Retrieve features and metadata
        feature_data = self.redis_client.get(feature_key)
        metadata_data = self.redis_client.get(metadata_key)
        
        if not feature_data or not metadata_data:
            return None
        
        features = json.loads(feature_data)
        metadata = FeatureMetadata.model_validate_json(metadata_data)
        
        # Validate freshness
        if validate_freshness:
            age = datetime.utcnow() - metadata.created_at
            if age > timedelta(hours=max_age_hours):
                # Features are stale
                return None
        
        # Validate checksum
        if self._compute_checksum(features) != metadata.checksum:
            # Data corruption detected
            raise ValueError(f"Feature checksum mismatch for {entity_id}")
        
        return features
    
    def get_metadata(
        self,
        entity_id: str,
        version: str = "v1"
    ) -> Optional[FeatureMetadata]:
        """Get feature metadata without retrieving features"""
        key = self._generate_key(entity_id, version)
        metadata_key = f"{key}:metadata"
        
        metadata_data = self.redis_client.get(metadata_key)
        if not metadata_data:
            return None
        
        return FeatureMetadata.model_validate_json(metadata_data)
    
    def delete_features(
        self,
        entity_id: str,
        version: str = "v1"
    ) -> bool:
        """Delete features for an entity"""
        key = self._generate_key(entity_id, version)
        feature_key = f"{key}:features"
        metadata_key = f"{key}:metadata"
        
        self.redis_client.delete(feature_key, metadata_key)
        return True
    
    def batch_store_features(
        self,
        entities: List[Dict[str, Any]],
        version: str = "v1",
        ttl_hours: Optional[int] = None
    ) -> int:
        """
        Batch store features for multiple entities
        
        Args:
            entities: List of dicts with 'entity_id' and 'features' keys
            version: Feature version
            ttl_hours: TTL in hours
        
        Returns:
            Number of entities stored
        """
        count = 0
        for entity in entities:
            entity_id = entity.get("entity_id")
            features = entity.get("features")
            
            if entity_id and features:
                self.store_features(entity_id, features, version, ttl_hours)
                count += 1
        
        return count
    
    def get_store_stats(self) -> Dict[str, Any]:
        """Get feature store statistics"""
        # Count keys by pattern
        pattern = f"{self.key_prefix}*:features"
        keys = self.redis_client.keys(pattern)
        
        return {
            "total_entities": len(keys),
            "redis_memory_used": self.redis_client.info("memory").get("used_memory_human"),
            "key_prefix": self.key_prefix
        }
    
    def clear_all(self, version: Optional[str] = None):
        """
        Clear all features (use with caution!)
        
        Args:
            version: If specified, only clear that version
        """
        if version:
            pattern = f"{self.key_prefix}{version}:*"
        else:
            pattern = f"{self.key_prefix}*"
        
        keys = self.redis_client.keys(pattern)
        if keys:
            self.redis_client.delete(*keys)
        
        return len(keys)


# Singleton instance
_feature_store_instance: Optional[FeatureStore] = None


def get_feature_store(redis_url: Optional[str] = None) -> FeatureStore:
    """Get or create feature store singleton"""
    global _feature_store_instance
    
    if _feature_store_instance is None:
        from src.backend.app.core.config import settings
        url = redis_url or getattr(settings, 'REDIS_URL', 'redis://localhost:6379/0')
        _feature_store_instance = FeatureStore(redis_url=url)
    
    return _feature_store_instance
