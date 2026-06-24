"""
WebSocket router.
Real-time fleet events, order updates, and copilot streaming.
"""

from __future__ import annotations

import asyncio
import json
from typing import Set

import redis.asyncio as redis
import structlog
from fastapi import APIRouter, Depends, WebSocketDisconnect, WebSocketException, status
from fastapi.websockets import WebSocket
from jose import JWTError, jwt
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.auth import ALGORITHM, AuthenticatedTenant, _get_secret_key
from src.api.deps import get_db, get_redis as get_redis_client
from src.api.rate_limit import check_rate_limit
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


async def _authenticate_ws(websocket: WebSocket) -> AuthenticatedTenant:
    # Dev mode: skip JWT validation
    if get_settings(allow_defaults=True).skip_external_startup_checks:
        return AuthenticatedTenant(
            tenant_id="00000000-0000-0000-0000-000000000001",
            name="Dev User",
            is_active=True,
        )

    secret = _get_secret_key()
    ws_protocol = websocket.headers.get("sec-websocket-protocol", "")

    if not ws_protocol:
        raise WebSocketException(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="Authentication required",
        )

    token = ws_protocol.split(",")[0].strip()
    if not token:
        raise WebSocketException(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="Missing authentication token",
        )

    try:
        payload = jwt.decode(token, secret, algorithms=[ALGORITHM])
        tenant_id: str | None = payload.get("sub")
        tenant_name: str | None = payload.get("name")

        if not tenant_id:
            raise WebSocketException(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="Invalid token: no tenant ID",
            )

        logger.info("ws_auth_success", tenant_id=tenant_id)
        return AuthenticatedTenant(
            tenant_id=tenant_id,
            name=tenant_name or "Unknown",
            is_active=True,
        )

    except JWTError as e:
        logger.warning("ws_auth_failed", reason=str(e))
        raise WebSocketException(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="Invalid or expired token",
        )


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    try:
        auth_result = await _authenticate_ws(websocket)
        tenant_id = auth_result.tenant_id
    except WebSocketException:
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
        initial_orders = []
        redis_client = await get_redis_client()
        try:
            async for key in redis_client.scan_iter(match=f"order:*"):
                order_data = await redis_client.hgetall(key)
                if order_data and order_data.get("tenant_id") == tenant_id:
                    initial_orders.append({
                        "order_id": order_data.get("order_id", key.split(":")[-1]),
                        "status": order_data.get("status", "active"),
                        "risk_score": float(order_data.get("risk_score", 0.5)),
                        "latitude": float(order_data.get("latitude", 0.0)),
                        "longitude": float(order_data.get("longitude", 0.0)),
                    })
        except Exception as e:
            logger.warning("initial_state_load_failed", tenant_id=tenant_id, error=str(e))

        await websocket.send_json({
            "type": "initial_state",
            "tenant_id": tenant_id,
            "orders": initial_orders,
            "message": "Connected to fleet updates",
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
