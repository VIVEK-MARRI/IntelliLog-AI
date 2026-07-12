"""
Agent runner - Continuous process that consumes GPS events and runs the agent.

This is the main loop that:
1. Reads GPS events from Redis Streams
2. Invokes the agent graph
3. Acknowledges processed events
4. Handles failures with retry + DLQ
5. Emits Prometheus metrics
"""

from datetime import datetime, timezone, timedelta
import asyncio
import json
import time
from typing import Optional
import structlog
import redis
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
import httpx
from prometheus_client import Counter, Histogram, Gauge, generate_latest

from src.agent.graph import build_agent_graph, AgentGraphState
from src.agent.state import StateManager
from src.ml.feature_engineering import FeatureBuilder
from src.ml.inference import PredictionService

logger = structlog.get_logger(__name__)


# ===== Prometheus Metrics =====

EVENTS_PROCESSED = Counter(
    "agent_events_processed_total",
    "Total GPS events processed by agent",
    ["tenant_id", "status"],
)

DECISIONS_MADE = Counter(
    "agent_decisions_total",
    "Total decisions made by agent",
    ["decision", "tenant_id"],
)

GRAPH_LATENCY = Histogram(
    "agent_graph_latency_seconds",
    "Latency of agent graph execution",
    ["tenant_id"],
    buckets=(0.05, 0.1, 0.5, 1.0, 2.0, 5.0),
)

RISK_SCORE = Histogram(
    "prediction_risk_score",
    "Distribution of risk scores",
    buckets=(0.1, 0.3, 0.5, 0.7, 0.9),
)

ACTIVE_HIGH_RISK_ORDERS = Gauge(
    "active_high_risk_orders",
    "Number of active high-risk orders",
    ["tenant_id"],
)

PROCESSING_FAILURES = Counter(
    "agent_processing_failures_total",
    "Total processing failures",
    ["tenant_id", "reason"],
)


# ===== Agent Runner =====

class AgentRunner:
    """
    Consumes GPS events from Redis Streams and runs the agent graph.
    Manages state, persistence, and error recovery.
    """
    
    def __init__(
        self,
        redis_url: str = "redis://localhost",
        db_url: str = "postgresql+asyncpg://user:password@localhost/db",
        models_dir: str = "models/",
        batch_size: int = 10,
        max_retries: int = 3,
    ):
        """
        Initialize agent runner.
        
        Args:
            redis_url: Redis connection URL
            db_url: PostgreSQL connection URL
            models_dir: Directory with trained ML models
            batch_size: Number of events to process per batch
            max_retries: Max retry attempts before DLQ
        """
        self.redis_url = redis_url
        self.db_url = db_url
        self.models_dir = models_dir
        self.batch_size = batch_size
        self.max_retries = max_retries
        
        # Will be initialized in setup()
        self.redis: Optional[Redis] = None
        self.db_engine = None
        self.db_session_factory = None
        self.http_client: Optional[httpx.AsyncClient] = None
        self.graph = None
        self.state_manager: Optional[StateManager] = None
        self.feature_builder: Optional[FeatureBuilder] = None
        self.prediction_service: Optional[PredictionService] = None
    
    async def setup(self):
        """Initialize all dependencies."""
        try:
            # Redis
            self.redis = await Redis.from_url(self.redis_url, decode_responses=False)
            
            # PostgreSQL
            self.db_engine = create_async_engine(self.db_url)
            self.db_session_factory = async_sessionmaker(self.db_engine, class_=AsyncSession)
            
            # HTTP client
            self.http_client = httpx.AsyncClient(timeout=10.0)
            
            # Agent graph
            self.graph = build_agent_graph()
            
            # State manager
            self.state_manager = StateManager(self.redis)
            
            # Feature builder
            self.feature_builder = FeatureBuilder()
            
            # Prediction service
            self.prediction_service = PredictionService(model_dir=self.models_dir)
            
            logger.info("agent_runner_initialized")
        
        except Exception as e:
            logger.error("agent_runner_setup_failed", error=str(e))
            raise
    
    async def cleanup(self):
        """Clean up resources."""
        try:
            if self.redis:
                await self.redis.close()
            if self.http_client:
                await self.http_client.aclose()
            if self.db_engine:
                await self.db_engine.dispose()
            
            logger.info("agent_runner_cleanup_complete")
        
        except Exception as e:
            logger.error("agent_runner_cleanup_failed", error=str(e))
    
    async def run_forever(self):
        """Main event loop - runs indefinitely."""
        logger.info("agent_runner_starting")
        
        try:
            # Create consumer group if it doesn't exist
            try:
                await self.redis.xgroup_create(
                    "gps_pings",
                    "delay_agent",
                    id="0",
                    mkstream=True,
                )
            except redis.ResponseError:
                # Group already exists
                pass
            
            # Main loop
            while True:
                try:
                    await self.process_batch()
                    await self.check_pending_events()
                    await asyncio.sleep(0.1)  # Small delay between batches
                
                except Exception as e:
                    logger.error("batch_processing_failed", error=str(e))
                    await asyncio.sleep(1)  # Backoff on error
        
        except KeyboardInterrupt:
            logger.info("agent_runner_stopped_by_user")
        except Exception as e:
            logger.error("agent_runner_fatal_error", error=str(e))
            raise
    
    async def process_batch(self):
        """Read and process a batch of GPS events."""
        try:
            # Read from stream
            messages = await self.redis.xreadgroup(
                "delay_agent",
                "worker-1",
                {"gps_pings": ">"},
                count=self.batch_size,
                block=1000,  # 1 second timeout
            )
            
            if not messages:
                return
            
            # Process each message
            for stream_name, event_list in messages:
                for message_id, event_data in event_list:
                    try:
                        await self.process_event(message_id, event_data)
                    except Exception as e:
                        logger.error(
                            "event_processing_error",
                            message_id=message_id,
                            error=str(e),
                        )
        
        except Exception as e:
            logger.error("batch_read_failed", error=str(e))
    
    async def process_event(self, message_id: bytes, event_data: dict) -> Optional[dict]:
        """
        Process one GPS event through the agent graph.
        
        Args:
            message_id: Redis stream message ID
            event_data: Raw event data from Redis
            
        Returns:
            Final agent state if successful
        """
        start_time = time.time()
        
        try:
            # Decode event data
            gps_event = {}
            for key, value in event_data.items():
                key_str = key.decode() if isinstance(key, bytes) else key
                value_str = value.decode() if isinstance(value, bytes) else value
                
                # Parse JSON fields
                if key_str in ["planned_eta"]:
                    gps_event[key_str] = value_str
                elif key_str in ["lat", "lng", "speed_kmh", "heading_degrees", "planned_lat", "planned_lng", "driver_on_time_rate"]:
                    try:
                        gps_event[key_str] = float(value_str)
                    except ValueError:
                        gps_event[key_str] = value_str
                elif key_str in ["planned_stops", "completed_stops"]:
                    try:
                        gps_event[key_str] = int(value_str)
                    except ValueError:
                        gps_event[key_str] = value_str
                else:
                    gps_event[key_str] = value_str
            
            tenant_id = gps_event.get("tenant_id", "unknown")
            order_id = gps_event.get("order_id", "unknown")
            
            # Get database session
            async with self.db_session_factory() as db_session:
                # Build initial state
                initial_state: AgentGraphState = {
                    "gps_event": gps_event,
                    "order_state": None,
                    "features": None,
                    "prediction": None,
                    "decision": None,
                    "tools_called": [],
                    "error": None,
                    "should_skip": False,
                    
                    # Inject dependencies
                    "state_manager": self.state_manager,
                    "db_session": db_session,
                    "redis_client": self.redis,
                    "http_client": self.http_client,
                    "feature_builder": self.feature_builder,
                    "prediction_service": self.prediction_service,
                }
                
                # Invoke graph
                final_state = await self.graph.ainvoke(initial_state)
                
                # Emit metrics
                if not final_state["should_skip"]:
                    order_state = final_state["order_state"]
                    if order_state:
                        RISK_SCORE.observe(order_state.current_risk_score)
                        
                        decision = order_state.last_decision or "unknown"
                        DECISIONS_MADE.labels(decision=decision, tenant_id=tenant_id).inc()
                        
                        if order_state.current_risk_score > 0.70:
                            ACTIVE_HIGH_RISK_ORDERS.labels(tenant_id=tenant_id).inc()
                
                latency_seconds = time.time() - start_time
                GRAPH_LATENCY.labels(tenant_id=tenant_id).observe(latency_seconds)
                EVENTS_PROCESSED.labels(tenant_id=tenant_id, status="success").inc()
                
                # Acknowledge the event
                await self.redis.xack("gps_pings", "delay_agent", message_id)
                
                logger.info(
                    "event_processed",
                    order_id=order_id,
                    tenant_id=tenant_id,
                    latency_ms=latency_seconds * 1000,
                    decision=final_state["order_state"].last_decision if final_state["order_state"] else None,
                )
                
                return final_state
        
        except Exception as e:
            tenant_id = gps_event.get("tenant_id", "unknown") if "gps_event" in locals() else "unknown"
            
            EVENTS_PROCESSED.labels(tenant_id=tenant_id, status="failed").inc()
            PROCESSING_FAILURES.labels(tenant_id=tenant_id, reason=str(type(e).__name__)).inc()
            
            logger.error(
                "event_processing_failed",
                message_id=message_id,
                error=str(e),
            )
            
            # Move to DLQ after max retries
            await self.handle_failed_event(message_id, event_data)
            
            return None
    
    async def check_pending_events(self):
        """Check and retry stale pending events (older than 30 seconds).

        Uses the modern redis-py dict-format API for xpending/xpending_range.
        The old tuple-unpack (message_id, consumer, idle_ms, delivery_count)
        was incompatible with redis-py>=4.x, which returns dicts — that's what
        caused the 'error="0"' warning: str() on the first element of the tuple
        returned "0" (the count field).
        """
        try:
            # xpending summary — redis-py>=4 returns a dict with 'pending' key
            pending_summary = await self.redis.xpending(
                "gps_pings",
                "delay_agent",
            )
            # Handle both dict and legacy tuple returns gracefully
            pending_count = (
                pending_summary.get("pending", 0)
                if isinstance(pending_summary, dict)
                else (pending_summary[0] if pending_summary else 0)
            )
            if not pending_count:
                return

            stale_threshold_ms = 30 * 1000

            # xpending_range — redis-py>=4 returns list of dicts
            stale_events = await self.redis.xpending_range(
                "gps_pings",
                "delay_agent",
                min="-",
                max="+",
                count=10,
            )

            for event_info in stale_events:
                if isinstance(event_info, dict):
                    message_id = event_info["message_id"]
                    idle_ms = event_info["time_since_delivered"]
                    delivery_count = event_info["times_delivered"]
                else:
                    # Legacy tuple format fallback
                    message_id, _consumer, idle_ms, delivery_count = event_info

                if idle_ms > stale_threshold_ms and delivery_count < self.max_retries:
                    await self.redis.xclaim(
                        "gps_pings",
                        "delay_agent",
                        "worker-1",
                        idle_ms,
                        [message_id],
                    )

        except Exception as e:
            logger.warning("pending_event_check_failed", error=str(e), exc_type=type(e).__name__)
    
    async def handle_failed_event(self, message_id: bytes, event_data: dict):
        """Send failed event to DLQ."""
        try:
            dlq_key = "gps_pings_dlq"
            
            await self.redis.xadd(
                dlq_key,
                {
                    "message_id": message_id,
                    "event_data": json.dumps(event_data),
                    "failed_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            
            # Acknowledge the failed event
            await self.redis.xack("gps_pings", "delay_agent", message_id)
            
            logger.warning("event_moved_to_dlq", message_id=message_id)
        
        except Exception as e:
            logger.error("dlq_write_failed", error=str(e))
    
    def get_metrics(self) -> bytes:
        """Return Prometheus metrics."""
        return generate_latest()


# ===== Main Entry Point =====

async def main():
    """Main entry point."""
    from src.core.config import get_settings

    settings = get_settings(allow_defaults=True)
    runner = AgentRunner(
        redis_url=settings.redis_url or "redis://localhost:6379",
        db_url=settings.database_url or "postgresql+asyncpg://user:password@localhost/db",
    )

    try:
        await runner.setup()
        await runner.run_forever()

    finally:
        await runner.cleanup()


if __name__ == "__main__":
    asyncio.run(main())
