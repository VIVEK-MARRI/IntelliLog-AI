"""
WebSocket router.
Real-time fleet events, order updates, and copilot streaming.

Auth note: WebSocket connections are authenticated via the single canonical
`get_current_tenant_ws` dependency in `src/api/auth.py`.  The old duplicated
`_authenticate_ws()` helper (which hardcoded a different UUID in dev mode and
caused order events to never reach the WebSocket) has been removed.

Tenant ID source of truth: auth.py:get_current_tenant (REST) and
auth.py:get_current_tenant_ws (WebSocket) both return "dev-tenant-id" in dev
mode and the JWT sub claim in production.  There is now exactly one place that
decides "what is the current tenant."
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Set

import redis.asyncio as redis
import structlog
from fastapi import APIRouter, WebSocketDisconnect, WebSocketException, status
from fastapi.websockets import WebSocket
from sqlalchemy import text

from src.api.auth import AuthenticatedTenant, get_current_tenant_ws
from src.api.deps import get_redis as get_redis_client, _get_session_maker
from src.core.config import get_settings
from src.core.metrics import (
    websocket_connections_active,
    websocket_connections_total,
    websocket_messages_sent_total,
)

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["websocket"])

active_connections: dict[str, Set[WebSocket]] = {}
settings = get_settings(allow_defaults=True)


async def broadcast_to_tenant(
    tenant_id: str,
    message: dict,
) -> None:
    """Broadcast message to all WebSocket clients for a tenant."""
    if tenant_id in active_connections:
        disconnected = set()
        for connection in active_connections[tenant_id]:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(
                    "websocket_send_failed",
                    tenant_id=tenant_id,
                    error=str(e),
                )
                disconnected.add(connection)

        active_connections[tenant_id] -= disconnected


async def _auth_from_websocket(websocket: WebSocket) -> AuthenticatedTenant:
    """
    Thin adapter: extract tenant identity for a WebSocket connection.

    Delegates entirely to the canonical `get_current_tenant_ws` function
    from auth.py so there is exactly one implementation of auth logic.
    Dev-mode returns tenant_id="dev-tenant-id" to match REST auth.

    Previously this module had its own `_authenticate_ws()` that hardcoded
    a different UUID ("00000000-0000-0000-0000-000000000001") in dev mode,
    causing orders published under "dev-tenant-id" to never appear on the
    WebSocket.  That function has been deleted.

    WebSocket (starlette.websockets.WebSocket) inherits from HTTPConnection,
    which exposes .headers and .state — the same interface `get_current_tenant_ws`
    needs. We pass it directly and None for db (the WS auth fn uses
    `db: AsyncSession = Depends(lambda: None)` meaning db is not used for auth).
    """
    # Cast is safe: WebSocket is an HTTPConnection subclass with .headers and .state
    return await get_current_tenant_ws(request=websocket, db=None)  # type: ignore[arg-type]


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    try:
        auth_result = await _auth_from_websocket(websocket)
        tenant_id = auth_result.tenant_id
    except (WebSocketException, Exception) as exc:
        logger.warning("websocket_auth_failed", error=str(exc))
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    ws_protocol = websocket.headers.get("sec-websocket-protocol", "")
    accept_protocol = ws_protocol.split(",")[0].strip() if ws_protocol else None

    if accept_protocol:
        await websocket.accept(subprotocol=accept_protocol)
    else:
        await websocket.accept()

    websocket_connections_total.labels(outcome="accepted").inc()
    websocket_connections_active.labels(tenant_id=tenant_id).inc()

    logger.info("websocket_connected", tenant_id=tenant_id)

    if tenant_id not in active_connections:
        active_connections[tenant_id] = set()
    active_connections[tenant_id].add(websocket)

    try:
        # ------------------------------------------------------------------ #
        # Build initial_state — always scoped to this tenant only.            #
        # Returns the same OrderResponse-shaped fields that REST returns so   #
        # the frontend can merge (not replace) existing rich data.            #
        # ------------------------------------------------------------------ #
        initial_orders: list[dict] = []
        redis_client = await get_redis_client()

        # 1. Try Redis hot-state cache first
        try:
            async for key in redis_client.scan_iter(match="order:*"):
                order_data = await redis_client.hgetall(key)
                if order_data and order_data.get("tenant_id") == tenant_id:
                    initial_orders.append({
                        "order_id": order_data.get("order_id", key.split(":")[-1]),
                        "status": order_data.get("status", "active"),
                        "risk_score": float(order_data.get("risk_score", 0.5)),
                        "latitude": float(order_data.get("latitude", 0.0)),
                        "longitude": float(order_data.get("longitude", 0.0)),
                        "driver_id": order_data.get("driver_id", ""),
                    })
        except Exception as e:
            logger.warning("initial_state_redis_load_failed", tenant_id=tenant_id, error=str(e))

        # 2. Fallback to PostgreSQL — ALWAYS filter by tenant_id (never scan all orders)
        if not initial_orders:
            try:
                session_maker = _get_session_maker()
                async with session_maker() as db:
                    result = await db.execute(
                        text("""
                            SELECT
                                id::text AS order_id,
                                status,
                                current_risk_score,
                                driver_id::text AS driver_id,
                                origin_lat,
                                origin_lng,
                                destination_lat,
                                destination_lng,
                                planned_eta,
                                current_eta
                            FROM orders
                            WHERE tenant_id = :tenant_id
                            ORDER BY updated_at DESC
                            LIMIT 200
                        """),
                        {"tenant_id": tenant_id},
                    )
                    for row in result:
                        initial_orders.append({
                            "order_id": row.order_id,
                            "status": row.status or "active",
                            "risk_score": float(row.current_risk_score or 0.5),
                            "driver_id": row.driver_id or "",
                            "latitude": float(row.origin_lat or 0.0),
                            "longitude": float(row.origin_lng or 0.0),
                            "destination_lat": float(row.destination_lat or 0.0),
                            "destination_lng": float(row.destination_lng or 0.0),
                            "planned_eta": row.planned_eta.isoformat() if row.planned_eta else None,
                            "current_eta": row.current_eta.isoformat() if row.current_eta else None,
                        })
            except Exception as e:
                logger.warning(
                    "initial_state_db_load_failed",
                    tenant_id=tenant_id,
                    error=str(e),
                )

        await websocket.send_json({
            "type": "initial_state",
            "data": {
                "orders": initial_orders,
                "tenant_id": tenant_id,
                "message": "Connected to fleet updates",
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        websocket_messages_sent_total.labels(message_type="initial_state").inc()

        pubsub = redis_client.pubsub()
        channel = f"tenant:{tenant_id}:events"
        await pubsub.subscribe(channel)
        logger.info("websocket_subscribed", tenant_id=tenant_id, channel=channel)

        async def redis_listen():
            while True:
                try:
                    message = await pubsub.get_message(
                        ignore_subscribe_messages=True,
                        timeout=1.0,
                    )
                    if not message:
                        await asyncio.sleep(0.05)
                        continue

                    if message["type"] == "message":
                        try:
                            data = json.loads(message["data"])
                            await websocket.send_json(data)
                            msg_type = data.get("type", "unknown")
                            websocket_messages_sent_total.labels(message_type=msg_type).inc()
                        except Exception as e:
                            logger.warning(
                                "websocket_redis_parse_error",
                                error=str(e),
                            )
                except WebSocketDisconnect:
                    raise
                except Exception as e:
                    logger.warning(
                        "websocket_redis_listen_error",
                        tenant_id=tenant_id,
                        error=str(e),
                    )
                    await asyncio.sleep(0.1)

        async def client_listen():
            while True:
                data = await websocket.receive_json()
                if data.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})

        redis_task = asyncio.create_task(redis_listen())
        client_task = asyncio.create_task(client_listen())

        try:
            await asyncio.gather(redis_task, client_task)
        except asyncio.CancelledError:
            redis_task.cancel()
            client_task.cancel()

    except WebSocketDisconnect:
        logger.info("websocket_disconnected", tenant_id=tenant_id)
    except WebSocketException as e:
        logger.error("websocket_error", tenant_id=tenant_id, error=str(e))
    except Exception as e:
        logger.error("websocket_unexpected_error", tenant_id=tenant_id, error=str(e))
        try:
            await websocket.close(code=status.WS_1011_SERVER_ERROR)
        except Exception:
            pass
    finally:
        if tenant_id in active_connections:
            active_connections[tenant_id].discard(websocket)
            if not active_connections[tenant_id]:
                del active_connections[tenant_id]
        websocket_connections_active.labels(tenant_id=tenant_id).dec()
        logger.info("websocket_cleaned_up", tenant_id=tenant_id)
