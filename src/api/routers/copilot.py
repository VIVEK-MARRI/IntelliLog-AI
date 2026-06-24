"""Operations copilot router — LLM-powered logistics intelligence."""

from __future__ import annotations

import json
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect, WebSocketException, status
from fastapi.responses import StreamingResponse
from jose import JWTError, jwt

from src.api.auth import ALGORITHM, AuthenticatedTenant, get_current_tenant, _get_secret_key
from src.api.deps import get_db, get_redis
from src.api.rate_limit import check_rate_limit
from src.api.schemas import CopilotQueryRequest, CopilotQueryResponse, CopilotWorkspaceResponse
from src.api.services.copilot import OperationsCopilotService
from src.core.config import get_settings

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["copilot"], prefix="/copilot")


@router.post("/query", response_model=CopilotQueryResponse)
async def query_copilot(
    http_request: Request,
    request: CopilotQueryRequest,
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    db=Depends(get_db),
    redis_client=Depends(get_redis),
) -> CopilotQueryResponse:
    settings = get_settings(allow_defaults=True)
    await check_rate_limit(http_request, settings.rate_limit_copilot_per_minute, key_prefix="copilot")

    logger.info("copilot_query", tenant_id=current_tenant.tenant_id, query=request.query)

    if not request.query.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="query is required",
        )

    service = OperationsCopilotService(db, redis_client)
    insight = await service.query(current_tenant.tenant_id, request.query, request.context)

    return CopilotQueryResponse(
        summary=insight.summary,
        evidence=insight.evidence,
        recommendations=insight.recommendations,
        confidence=insight.confidence,
        sources=insight.sources,
        intent=insight.intent,
        related_order_ids=insight.related_order_ids,
        metadata=insight.metadata,
    )


@router.post("/recommendations")
async def get_recommendations(
    http_request: Request,
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    db=Depends(get_db),
    redis_client=Depends(get_redis),
) -> dict:
    settings = get_settings(allow_defaults=True)
    await check_rate_limit(http_request, settings.rate_limit_copilot_per_minute, key_prefix="copilot_rec")

    service = OperationsCopilotService(db, redis_client)
    insight = await service.generate_recommendations(current_tenant.tenant_id)

    return {
        "summary": insight.summary,
        "evidence": insight.evidence,
        "recommendations": insight.recommendations,
        "confidence": insight.confidence,
        "sources": insight.sources,
        "related_order_ids": insight.related_order_ids,
        "metadata": insight.metadata,
    }


@router.post("/workspace", response_model=CopilotWorkspaceResponse)
async def workspace_query(
    http_request: Request,
    request: CopilotQueryRequest,
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    db=Depends(get_db),
    redis_client=Depends(get_redis),
) -> CopilotWorkspaceResponse:
    """Rich workspace query with supporting orders, predictions, decisions, and actions."""
    settings = get_settings(allow_defaults=True)
    await check_rate_limit(http_request, settings.rate_limit_copilot_per_minute, key_prefix="copilot_workspace")

    logger.info("copilot_workspace_query", tenant_id=current_tenant.tenant_id, query=request.query)

    if not request.query.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="query is required",
        )

    service = OperationsCopilotService(db, redis_client)
    result = await service.workspace_query(current_tenant.tenant_id, request.query)

    return CopilotWorkspaceResponse(**result)


@router.post("/anomalies")
async def analyze_anomalies(
    http_request: Request,
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
    db=Depends(get_db),
    redis_client=Depends(get_redis),
) -> dict:
    settings = get_settings(allow_defaults=True)
    await check_rate_limit(http_request, settings.rate_limit_copilot_per_minute, key_prefix="copilot_anom")

    service = OperationsCopilotService(db, redis_client)
    insight = await service.analyze_anomalies(current_tenant.tenant_id)

    return {
        "summary": insight.summary,
        "evidence": insight.evidence,
        "recommendations": insight.recommendations,
        "confidence": insight.confidence,
        "sources": insight.sources,
        "related_order_ids": insight.related_order_ids,
        "metadata": insight.metadata,
    }


@router.websocket("/ws/{tenant_id}")
async def copilot_websocket_endpoint(websocket: WebSocket, tenant_id: str):
    """Streaming copilot responses over WebSocket with progressive updates."""
    db = None
    redis_client = None

    ws_protocol = websocket.headers.get("sec-websocket-protocol", "")
    if not ws_protocol:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    token = ws_protocol.split(",")[0].strip()
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        secret = _get_secret_key()
        payload = jwt.decode(token, secret, algorithms=[ALGORITHM])
        token_tenant_id: str | None = payload.get("sub")
        if not token_tenant_id or token_tenant_id != tenant_id:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    except JWTError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    accept_protocol = ws_protocol.split(",")[0].strip()
    await websocket.accept(subprotocol=accept_protocol)
    logger.info("copilot_ws_authenticated", tenant_id=tenant_id)

    try:
        data = await websocket.receive_json()
        query = data.get("query", "").strip()
        if not query:
            await websocket.send_json({"type": "error", "content": "query is required"})
            await websocket.close()
            return

        db = await anext(get_db())
        redis_client = await get_redis()
        service = OperationsCopilotService(db, redis_client)

        await websocket.send_json({"type": "status", "stage": "thinking", "content": "Analyzing your question..."})
        await websocket.send_json({"type": "status", "stage": "gathering_context", "content": "Gathering operational telemetry..."})

        full_response = ""
        async for token in service.stream_query(tenant_id, query):
            full_response += token

        try:
            parsed = json.loads(full_response)
            await websocket.send_json({
                "type": "copilot_response",
                "content": parsed,
            })
        except json.JSONDecodeError:
            await websocket.send_json({
                "type": "copilot_response",
                "content": {
                    "summary": full_response,
                    "confidence": 0.0,
                    "evidence": [],
                    "recommendations": [],
                },
            })

    except WebSocketDisconnect:
        logger.info("copilot_ws_disconnect", tenant_id=tenant_id)
    except Exception as e:
        logger.error("copilot_ws_error", tenant_id=tenant_id, error=str(e))
        try:
            await websocket.send_json({"type": "error", "content": str(e)})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
        if db is not None:
            try:
                await db.close()
            except Exception:
                pass
        if redis_client is not None:
            try:
                await redis_client.close()
            except Exception:
                pass
