"""WebSocket endpoint for dispatch dashboard."""

import asyncio
import json
import logging

import redis.asyncio as aioredis
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from src.backend.app.websocket.dispatch_manager import get_dispatch_manager
from src.backend.app.core.config import settings
from src.backend.app.core.auth import decode_jwt_token, AuthenticatedUser

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/dispatch/{tenant_id}")
async def websocket_dispatch_endpoint(websocket: WebSocket, tenant_id: str):
    """
    WebSocket endpoint for dispatch dashboard.
    
    Handles:
    - Initial connection with state snapshot
    - Redis pub/sub subscription for position updates
    - Broadcasting to all connected clients for tenant
    - Graceful disconnection cleanup
    """
    authorization = websocket.headers.get("authorization")
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]

    # Browser WebSocket clients cannot set custom Authorization headers.
    # Accept token from query param or subprotocol as a fallback.
    if not token:
        token = websocket.query_params.get("token")

    if not token:
        raw_protocol = websocket.headers.get("sec-websocket-protocol", "")
        token = raw_protocol.split(",")[0].strip() if raw_protocol else None

    if not token:
        await websocket.close(code=4401)
        return

    try:
        payload = decode_jwt_token(token)
    except Exception:
        await websocket.close(code=4401)
        return

    if payload.get("type") != "access":
        await websocket.close(code=4401)
        return

    current_user = AuthenticatedUser(
        user_id=str(payload.get("sub", "")),
        tenant_id=str(payload.get("tenant_id", "")),
        role=str(payload.get("role", "")),
        email=payload.get("email"),
        auth_type="bearer",
    )

    if not current_user.tenant_id or current_user.tenant_id != tenant_id:
        await websocket.close(code=4001)
        return

    manager = get_dispatch_manager()
    await manager.connect(websocket, tenant_id)

    # Send initial state snapshot
    await manager.send_state_snapshot(websocket, tenant_id)

    # Subscribe to Redis pub/sub for position updates
    redis_client = None
    pubsub = None

    try:
        redis_client = await aioredis.from_url(
            settings.REDIS_FEATURE_STORE_URL,
            decode_responses=True,
        )
        pubsub = redis_client.pubsub()
        await pubsub.subscribe(f"position_updates:{tenant_id}")

        # Start listening to position updates
        while True:
            # Check for WebSocket messages (client can send commands)
            try:
                # Use timeout to allow pub/sub listening
                data = await asyncio.wait_for(websocket.receive_json(), timeout=0.1)
                
                # Handle client messages if needed
                if data.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
                    
            except asyncio.TimeoutError:
                # No WebSocket message, continue to pub/sub
                pass
            except Exception:
                # WebSocket receive error, break loop
                break

            # Listen for pub/sub messages
            try:
                message = await asyncio.wait_for(
                    pubsub.get_message(ignore_subscribe_messages=True), 
                    timeout=0.1
                )
                
                if message:
                    position_data = json.loads(message["data"])
                    
                    # Enhance with current route info
                    from src.backend.app.services.tracking_service import get_geo_tracker
                    tracker = get_geo_tracker()
                    driver_id = position_data.get("driver_id")
                    on_route = not tracker.get_driver_deviation(driver_id)
                    position_data["on_route"] = on_route
                    
                    # Broadcast to all connected clients
                    await manager.broadcast_position_update(tenant_id, position_data)
                    
            except asyncio.TimeoutError:
                # No pub/sub message
                pass
            except Exception as e:
                logger.error(f"Error processing pub/sub message: {e}")
                break

            # Small delay to prevent busy waiting
            await asyncio.sleep(0.01)

    except WebSocketDisconnect:
        logger.info(f"Client disconnected from dispatch for tenant {tenant_id}")
        manager.disconnect(websocket, tenant_id)
    except Exception as e:
        logger.error(f"WebSocket error for tenant {tenant_id}: {e}")
        manager.disconnect(websocket, tenant_id)
    finally:
        # Cleanup Redis subscription
        if pubsub:
            try:
                await pubsub.unsubscribe(f"position_updates:{tenant_id}")
                await pubsub.close()
            except Exception as e:
                logger.error(f"Failed to cleanup pubsub: {e}")

        if redis_client:
            try:
                await redis_client.close()
            except Exception as e:
                logger.error(f"Failed to close redis client: {e}")


