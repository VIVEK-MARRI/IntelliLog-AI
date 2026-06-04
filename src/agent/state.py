"""
Agent state definition and persistence for delay prevention agent.

The OrderAgentState is the complete knowledge the agent maintains about
one active order. It's stored in Redis and updated on each GPS event.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
import json
import logging
import structlog
from redis.asyncio import Redis

logger = structlog.get_logger(__name__)


class OrderAgentState(BaseModel):
    """
    Complete state for one order being monitored by the delay prevention agent.
    Stored in Redis as JSON. TTL is 4 hours (order typically completes in 2-3 hours).
    """
    
    # === Identity ===
    order_id: str
    driver_id: str
    tenant_id: str
    
    # === Current Position (updated every GPS ping) ===
    current_lat: float
    current_lng: float
    current_speed_kmh: float
    heading_degrees: float = 0.0
    last_ping_at: datetime
    ping_sequence: int = 0
    
    # === Route Progress ===
    planned_stops: int
    completed_stops: int
    planned_eta: datetime
    current_eta: datetime  # Recalculated by agent as risk changes
    route_deviation_meters: float = 0.0
    
    # === History for Feature Computation ===
    # Keep last 10 speeds (for speed_trend feature)
    recent_speeds: list[float] = Field(default_factory=list, max_length=10)
    # Keep last 5 stop dwell times (in minutes)
    recent_stop_dwell_times: list[float] = Field(default_factory=list, max_length=5)
    
    # === ML Prediction State ===
    current_risk_score: float = 0.0  # 0.0-1.0
    risk_history: list[float] = Field(default_factory=list, max_length=20)
    last_prediction_at: Optional[datetime] = None
    
    # === Agent Decision State ===
    last_decision: Optional[str] = None  # 'no_action', 'alert_only', 'reroute_and_alert'
    last_decision_at: Optional[datetime] = None
    alert_sent_count: int = 0
    last_alert_sent_at: Optional[datetime] = None
    reroute_triggered: bool = False
    last_reroute_at: Optional[datetime] = None
    
    # === Driver Context ===
    driver_on_time_rate: float = 0.85
    
    model_config = ConfigDict()


class StateManager:
    """
    Manages persistence of OrderAgentState in Redis.
    All operations are async.
    """
    
    def __init__(self, redis_client: Redis):
        """
        Initialize StateManager with Redis client.
        
        Args:
            redis_client: Async Redis client
        """
        self.redis = redis_client
        self.key_prefix = "agent:order_state:"
    
    def _get_key(self, order_id: str) -> str:
        """Generate Redis key for order state."""
        return f"{self.key_prefix}{order_id}"
    
    async def load(self, order_id: str) -> Optional[OrderAgentState]:
        """
        Load OrderAgentState from Redis.
        
        Args:
            order_id: Order identifier
            
        Returns:
            OrderAgentState if exists, None otherwise
        """
        try:
            key = self._get_key(order_id)
            data = await self.redis.get(key)
            
            if data is None:
                return None
            
            # Parse JSON
            state_dict = json.loads(data)
            # Parse datetime strings back to datetime objects
            state_dict["last_ping_at"] = datetime.fromisoformat(
                state_dict["last_ping_at"]
            )
            state_dict["planned_eta"] = datetime.fromisoformat(
                state_dict["planned_eta"]
            )
            state_dict["current_eta"] = datetime.fromisoformat(
                state_dict["current_eta"]
            )
            
            # Optional fields
            if state_dict.get("last_prediction_at"):
                state_dict["last_prediction_at"] = datetime.fromisoformat(
                    state_dict["last_prediction_at"]
                )
            if state_dict.get("last_decision_at"):
                state_dict["last_decision_at"] = datetime.fromisoformat(
                    state_dict["last_decision_at"]
                )
            if state_dict.get("last_alert_sent_at"):
                state_dict["last_alert_sent_at"] = datetime.fromisoformat(
                    state_dict["last_alert_sent_at"]
                )
            if state_dict.get("last_reroute_at"):
                state_dict["last_reroute_at"] = datetime.fromisoformat(
                    state_dict["last_reroute_at"]
                )
            
            return OrderAgentState(**state_dict)
        
        except Exception as e:
            await logger.aerror(
                "load_state_failed",
                order_id=order_id,
                error=str(e)
            )
            return None
    
    async def save(
        self,
        state: OrderAgentState,
        ttl_hours: int = 4
    ) -> None:
        """
        Save OrderAgentState to Redis.
        
        Args:
            state: OrderAgentState to save
            ttl_hours: Time-to-live in hours (default 4 hours)
        """
        try:
            key = self._get_key(state.order_id)
            
            # Convert to JSON (Pydantic handles datetime serialization)
            state_json = state.model_dump_json()
            
            # Set with expiration
            ttl_seconds = ttl_hours * 3600
            await self.redis.setex(
                key,
                ttl_seconds,
                state_json
            )
            
        except Exception as e:
            await logger.aerror(
                "save_state_failed",
                order_id=state.order_id,
                error=str(e)
            )
            raise
    
    async def delete(self, order_id: str) -> None:
        """
        Delete OrderAgentState from Redis (when order completes).
        
        Args:
            order_id: Order identifier
        """
        try:
            key = self._get_key(order_id)
            await self.redis.delete(key)
            
        except Exception as e:
            await logger.aerror(
                "delete_state_failed",
                order_id=order_id,
                error=str(e)
            )
    
    async def get_active_orders_for_tenant(self, tenant_id: str) -> list[str]:
        """
        Get all active order IDs for a tenant.
        
        Args:
            tenant_id: Tenant identifier
            
        Returns:
            List of order IDs
        """
        try:
            # Scan keys with prefix, then load to filter by tenant
            pattern = f"{self.key_prefix}*"
            orders = []
            
            async for key in self.redis.scan_iter(match=pattern):
                if isinstance(key, bytes):
                    key = key.decode()
                order_id = key.replace(self.key_prefix, "")
                state = await self.load(order_id)
                
                if state and state.tenant_id == tenant_id:
                    orders.append(order_id)
            
            return orders
        
        except Exception as e:
            await logger.aerror(
                "get_active_orders_failed",
                tenant_id=tenant_id,
                error=str(e)
            )
            return []
