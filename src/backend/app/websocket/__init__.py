"""WebSocket handlers for real-time updates."""

from src.backend.app.websocket.dispatch_manager import get_dispatch_manager
from src.backend.app.websocket.dispatch_ws import router

__all__ = ["get_dispatch_manager", "router"]
