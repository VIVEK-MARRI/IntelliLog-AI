from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
import asyncio
import json
import logging
from src.backend.app.api import deps
from src.backend.app.db.base import SessionLocal
from src.backend.app.services.reroute_service import live_location_store, reroute_tenant

router = APIRouter()

# Store connected clients
connected_clients = set()
logger = logging.getLogger(__name__)


@router.websocket("/ws/locations")
async def driver_locations_ws(websocket: WebSocket):
    """
    WebSocket endpoint for live driver location broadcasting.
    Clients connect and receive location updates for all drivers.
    """
    await websocket.accept()
    connected_clients.add(websocket)
    
    try:
        # Send initial connection message
        await websocket.send_json({"type": "connected", "message": "Connected to location broadcast"})
        logger.info(f"WebSocket client connected. Total: {len(connected_clients)}")
        
        while True:
            # Handle messages with timeout to keep connection from hanging indefinitely if needed
            try:
                # We wait for messages but also use this as a heartbeat check
                data = await asyncio.wait_for(websocket.receive_json(), timeout=60.0)
                tenant_id = data.get("tenant_id", "default")
                driver_id = data.get("driver_id")
                lat = data.get("lat")
                lng = data.get("lng")
                speed_kmph = data.get("speed_kmph")

                if driver_id and lat is not None and lng is not None:
                    # Store location
                    await live_location_store.update_location(
                        tenant_id=tenant_id,
                        driver_id=str(driver_id),
                        lat=float(lat),
                        lng=float(lng),
                        speed_kmph=float(speed_kmph) if speed_kmph is not None else None,
                    )
                    
                    # Broadcast to all connected clients
                    location_update = {
                        "type": "location_update",
                        "tenant_id": tenant_id,
                        "driver_id": str(driver_id),
                        "lat": float(lat),
                        "lng": float(lng),
                        "speed_kmph": float(speed_kmph) if speed_kmph is not None else None,
                    }
                    
                    dead_clients = []
                    for client in connected_clients:
                        try:
                            await client.send_json(location_update)
                        except Exception as e:
                            logger.warning(f"Failed to send to client: {e}")
                            dead_clients.append(client)
                    
                    for dead in dead_clients:
                        connected_clients.discard(dead)
            except asyncio.TimeoutError:
                # Send a ping-like message to keep alive
                try:
                    await websocket.send_json({"type": "ping"})
                except:
                    break
                        
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected normally")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        connected_clients.discard(websocket)
        try:
            await websocket.close()
        except:
            pass
        logger.info(f"WebSocket client removed. Total: {len(connected_clients)}")


@router.post("/reroute/now")
def reroute_now(
    tenant_id: str = Depends(deps.get_current_tenant),
):
    """Manually trigger reroute for current tenant."""
    db = SessionLocal()
    try:
        result = reroute_tenant(db, tenant_id)
        return result
    finally:
        db.close()
