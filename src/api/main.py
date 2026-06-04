"""
FastAPI application for IntelliLog-AI.
Production-grade API with authentication, middleware, and structured logging.
"""

from __future__ import annotations

import asyncio
import time
import uuid
import os
from contextlib import asynccontextmanager
from typing import Callable

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware

from src.api.deps import get_db, get_redis
from src.api.routers import (
    agent,
    auth,
    copilot,
    drivers,
    health,
    insights,
    orders,
    predictions,
    routes,
    websocket,
)
from src.core.metrics import generate_latest
from src.core.config import get_settings
from src.ml.inference import PredictionService
from src.api.rate_limit import check_rate_limit
from src.services.executive_summary import ExecutiveSummaryService, SummaryType
from src.services.context_builder import ContextBuilder

logger = structlog.get_logger(__name__)


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Adds UUID request ID to all requests and logs context."""

    async def dispatch(self, request: Request, call_next: Callable) -> object:
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id

        with structlog.contextvars.bound_contextvars(request_id=request_id):
            response = await call_next(request)
            response.headers["X-Request-ID"] = request_id
            return response


class TimingMiddleware(BaseHTTPMiddleware):
    """Logs request timing and metrics."""

    async def dispatch(self, request: Request, call_next: Callable) -> object:
        start_time = time.time()
        request_id = getattr(request.state, "request_id", "unknown")
        tenant_id = getattr(request.state, "tenant_id", "none")

        response = await call_next(request)

        latency_ms = (time.time() - start_time) * 1000
        status_code = response.status_code

        logger.info(
            "request_completed",
            method=request.method,
            path=request.url.path,
            status_code=status_code,
            latency_ms=latency_ms,
            request_id=request_id,
            tenant_id=tenant_id,
        )

        response.headers["X-Response-Time-Ms"] = str(int(latency_ms))
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup: Initialize services, verify connections.
    Shutdown: Gracefully close connections.
    """
    logger.info("startup", step="IntelliLog-AI API starting")
    skip_external_checks = os.getenv("SKIP_EXTERNAL_STARTUP_CHECKS", "false").lower() == "true"

    try:
        settings = get_settings(allow_defaults=True)
        logger.info("startup", step="configuration_validated", environment=settings.environment)

        # Load ML model
        logger.info("startup", step="loading_ml_model")
        prediction_service = PredictionService(model_dir="models/")
        app.state.prediction_service = prediction_service
        logger.info("startup", step="ml_model_loaded")

        if skip_external_checks:
            logger.warning(
                "startup",
                step="skipping_external_dependency_checks",
                note="Running in local no-docker mode",
            )
        else:
            from src.optimization.service import OptimizationService

            # Verify Redis connection
            logger.info("startup", step="verifying_redis")
            redis_client = await get_redis()
            await redis_client.ping()
            app.state.redis_client = redis_client
            logger.info("startup", step="redis_connected")

            # Verify database connection
            logger.info("startup", step="verifying_database")
            async for db in get_db():
                try:
                    await db.execute(text("SELECT 1"))
                    logger.info("startup", step="database_connected")
                finally:
                    await db.close()

            # Initialize optimization service
            logger.info("startup", step="initializing_optimization_service")
            optimization_service = OptimizationService(redis_client)
            app.state.optimization_service = optimization_service
            logger.info("startup", step="optimization_service_ready")

        logger.info("startup", step="IntelliLog-AI API started", version="1.0.0")

    except Exception as e:
        logger.error("startup_error", error=str(e), exc_info=True)
        raise

    # Start background executive summary scheduler
    summary_task = None
    if not skip_external_checks:

        async def _run_summary_scheduler():
            while True:
                try:
                    async for db in get_db():
                        try:
                            redis_client = await get_redis()
                            ctx_builder = ContextBuilder(db, redis_client)
                            summary_service = ExecutiveSummaryService(db)
                            for tenant_id in ["default"]:
                                try:
                                    ctx = await ctx_builder.build(tenant_id)
                                    context_text = ctx_builder.context_to_prompt_text(ctx)
                                    await summary_service.generate_all_types(tenant_id, context_text)
                                except Exception as te:
                                    logger.warning("summary_tenant_skipped", tenant_id=tenant_id, error=str(te))
                            await redis_client.close()
                        finally:
                            await db.close()
                except Exception as se:
                    logger.error("summary_scheduler_error", error=str(se))
                await asyncio.sleep(900)  # 15 minutes

        summary_task = asyncio.create_task(_run_summary_scheduler())
        logger.info("startup", step="executive_summary_scheduler_started", interval_seconds=900)

    yield

    # Cancel summary scheduler
    if summary_task:
        summary_task.cancel()
        try:
            await summary_task
        except asyncio.CancelledError:
            pass

    # Shutdown
    logger.info("shutdown", step="IntelliLog-AI API shutting down")
    try:
        if hasattr(app.state, "redis_client"):
            await app.state.redis_client.close()
            logger.info("shutdown", step="redis_closed")
    except Exception as e:
        logger.error("shutdown_error", error=str(e))


# Create FastAPI app
app = FastAPI(
    title="IntelliLog-AI",
    version="1.0.0",
    description="Production Logistics Delay Prevention API",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url=None,
)

# Add middleware (order matters - outermost first)
app.add_middleware(TimingMiddleware)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5500",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5500",
        "http://localhost:8000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-Request-ID",
        "X-API-Key",
        "Sec-WebSocket-Protocol",
    ],
)

# Include routers
app.include_router(health.router)
app.include_router(auth.router, prefix="/api/v1")
app.include_router(insights.router, prefix="/api/v1")
app.include_router(orders.router, prefix="/api/v1")
app.include_router(predictions.router, prefix="/api/v1")
app.include_router(routes.router, prefix="/api/v1")
app.include_router(agent.router, prefix="/api/v1")
app.include_router(copilot.router, prefix="/api/v1")
app.include_router(drivers.router, prefix="/api/v1")
app.include_router(websocket.router)


@app.get("/")
async def root():
    """Root endpoint redirects to API documentation."""
    return {"message": "IntelliLog-AI API v1.0.0", "docs": "/docs"}


@app.get("/metrics")
async def metrics(request: Request) -> Response:
    """
    Expose Prometheus metrics.

    Access requires a valid PROMETHEUS_AUTH_TOKEN (set via env var).
    If PROMETHEUS_AUTH_TOKEN is not configured, metrics are only accessible
    from internal network ranges (localhost, pod IP).
    """
    settings = get_settings(allow_defaults=True)

    if not settings.prometheus_enabled:
        return Response(status_code=404)

    # Check for prometheus auth token
    auth_token = settings.prometheus_auth_token
    if auth_token:
        provided = request.headers.get("Authorization", "").removeprefix("Bearer ")
        if not provided or provided != auth_token:
            return Response(
                content="Unauthorized",
                status_code=401,
                headers={"WWW-Authenticate": "Bearer"},
            )

    return Response(content=generate_latest(), media_type="text/plain; version=0.0.4")
