"""WebSocket connection manager for dispatch dashboard real-time updates."""

import asyncio
import json
import logging
from typing import Dict, List, Optional, Set

import redis.asyncio as aioredis
from fastapi import WebSocket, WebSocketDisconnect

from src.backend.app.schemas.tracking import (
    DriverStateSnapshot,
    PositionBroadcast,
    WebSocketMessage,
)
from src.backend.app.services.tracking_service import get_geo_tracker

logger = logging.getLogger(__name__)


class DispatchConnectionManager:
    """Manages WebSocket connections for dispatch dashboard."""

    def __init__(self):
        """Initialize connection manager."""
        self.active_connections: Dict[str, Set[WebSocket]] = {}  # {tenant_id: {websockets}}
        self.position_subscribers: Dict[str, Optional[aioredis.Redis]] = {}  # {tenant_id: redis_client}

    async def connect(self, websocket: WebSocket, tenant_id: str):
        """Accept new WebSocket connection and initialize."""
        await websocket.accept()

        if tenant_id not in self.active_connections:
            self.active_connections[tenant_id] = set()
        self.active_connections[tenant_id].add(websocket)

        logger.info(f"WebSocket connected for tenant {tenant_id}. Total connections: {len(self.active_connections[tenant_id])}")

        # Subscribe to Redis pub/sub channel for this tenant
        await self._subscribe_to_updates(tenant_id)

    def disconnect(self, websocket: WebSocket, tenant_id: str):
        """Remove WebSocket connection."""
        if tenant_id in self.active_connections:
            self.active_connections[tenant_id].discard(websocket)
            if not self.active_connections[tenant_id]:
                del self.active_connections[tenant_id]

        logger.info(f"WebSocket disconnected for tenant {tenant_id}")

    async def _subscribe_to_updates(self, tenant_id: str):
        """Subscribe to Redis pub/sub for position updates."""
        try:
            # This will be handled in the WebSocket endpoint loop
            pass
        except Exception as e:
            logger.error(f"Failed to subscribe to updates: {e}")

    async def send_state_snapshot(self, websocket: WebSocket, tenant_id: str):
        """Send current state of all active drivers and orders on connect."""
        try:
            tracker = get_geo_tracker()
            drivers = tracker.get_all_active_drivers(tenant_id)

            snapshot_message = {
                "type": "state_snapshot",
                "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
                "drivers": [
                    {
                        "driver_id": d["driver_id"],
                        "latitude": d["latitude"],
                        "longitude": d["longitude"],
                        "speed_kmh": d["speed_kmh"],
                        "heading_degrees": d["heading_degrees"],
                        "on_route": not tracker.get_driver_deviation(d["driver_id"]),
                        "current_route_id": tracker.get_driver_current_route(d["driver_id"]),
                    }
                    for d in drivers
                ],
            }

            await websocket.send_json(snapshot_message)
            logger.debug(f"Sent state snapshot to client: {len(drivers)} drivers")
        except Exception as e:
            logger.error(f"Failed to send state snapshot: {e}")
            await websocket.send_json({"type": "error", "message": str(e)})

    async def broadcast_position_update(
        self, tenant_id: str, position_data: dict
    ):
        """Broadcast position update to all connected clients for tenant."""
        if tenant_id not in self.active_connections:
            return

        message = {
            "type": "position_update",
            "driver_id": position_data.get("driver_id"),
            "latitude": position_data.get("latitude"),
            "longitude": position_data.get("longitude"),
            "speed_kmh": position_data.get("speed_kmh"),
            "heading_degrees": position_data.get("heading_degrees"),
            "timestamp": position_data.get("timestamp"),
            "on_route": position_data.get("on_route", True),
        }

        disconnected = set()
        for websocket in self.active_connections[tenant_id]:
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send to client: {e}")
                disconnected.add(websocket)

        # Clean up disconnected clients
        for ws in disconnected:
            self.disconnect(ws, tenant_id)

    async def broadcast_deviation_alert(
        self, tenant_id: str, driver_id: str, distance_m: float
    ):
        """Broadcast deviation alert to all connected clients."""
        if tenant_id not in self.active_connections:
            return

        message = {
            "type": "deviation_alert",
            "driver_id": driver_id,
            "perpendicular_distance_m": distance_m,
            "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
        }

        disconnected = set()
        for websocket in self.active_connections[tenant_id]:
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send deviation alert: {e}")
                disconnected.add(websocket)

        for ws in disconnected:
            self.disconnect(ws, tenant_id)

    async def broadcast_reoptimization_triggered(
        self, tenant_id: str, driver_id: str, route_ids: List[str]
    ):
        """Broadcast that re-routing has been triggered."""
        if tenant_id not in self.active_connections:
            return

        message = {
            "type": "reoptimize_triggered",
            "driver_id": driver_id,
            "affected_routes": route_ids,
            "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
        }

        disconnected = set()
        for websocket in self.active_connections[tenant_id]:
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send reoptimize alert: {e}")
                disconnected.add(websocket)

        for ws in disconnected:
            self.disconnect(ws, tenant_id)

    async def broadcast_driver_arrived(
        self, tenant_id: str, driver_id: str, route_id: str
    ):
        """Broadcast that driver has arrived at destination."""
        if tenant_id not in self.active_connections:
            return

        message = {
            "type": "driver_arrived",
            "driver_id": driver_id,
            "route_id": route_id,
            "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
        }

        disconnected = set()
        for websocket in self.active_connections[tenant_id]:
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send driver arrived alert: {e}")
                disconnected.add(websocket)

        for ws in disconnected:
            self.disconnect(ws, tenant_id)


# Global manager instance
_manager: Optional[DispatchConnectionManager] = None


def get_dispatch_manager() -> DispatchConnectionManager:
    """Get or create dispatch connection manager."""
    global _manager
    if _manager is None:
        _manager = DispatchConnectionManager()
    return _manager
