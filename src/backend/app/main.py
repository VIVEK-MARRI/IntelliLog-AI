import asyncio
import uuid

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from src.backend.app.core.config import settings
from src.backend.app.core.logging import setup_logging
from src.backend.app.core.rate_limit import RateLimitExceededError

# Configure logging at startup
setup_logging()


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Attach request ID for tracing and enforce max request size."""

    MAX_BODY_BYTES = 1024 * 1024

    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())[:8]
        request.state.request_id = request_id
        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                if int(content_length) > self.MAX_BODY_BYTES:
                    return JSONResponse(
                        status_code=413,
                        content={"detail": "Request body too large (max 1MB)"},
                        headers={"X-Request-ID": request_id},
                    )
            except ValueError:
                pass

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response

def create_application() -> FastAPI:
    application = FastAPI(
        title=settings.PROJECT_NAME,
        openapi_url="/openapi.json",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # Set all CORS enabled origins
    application.add_middleware(RequestIDMiddleware)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://localhost:3000",
            "http://localhost:3001",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:3001",
            "http://0.0.0.0:5173",
            "http://0.0.0.0:3000",
            "http://0.0.0.0:3001",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # application.add_middleware(
    #     TrustedHostMiddleware, 
    #     allowed_hosts=["*"] # TODO: restrict to domain
    # )

    # Import and include routers here
    from src.backend.app.api.api_v1.api import api_router
    from src.backend.app.websocket.dispatch_ws import router as ws_router
    application.include_router(api_router, prefix=settings.API_V1_STR)
    application.include_router(ws_router)
    
    @application.get("/")
    def root():
        return {"message": "Server is running"}

    @application.get("/health")
    def health_check():
        print("Health check endpoint called")
        return {"status": "ok", "project": settings.PROJECT_NAME}

    @application.exception_handler(RateLimitExceededError)
    async def rate_limit_exceeded_handler(request, exc: RateLimitExceededError):
        return JSONResponse(
            status_code=429,
            content={
                "error": "rate_limit_exceeded",
                "retry_after_seconds": int(exc.retry_after_seconds),
                "limit": exc.limit,
            },
            headers={"Retry-After": str(exc.retry_after_seconds)},
        )
    
    # ML System startup event
    @application.on_event("startup")
    async def startup_event():
        """Initialize ML system on application startup"""
        from src.backend.app.api.api_v1.endpoints.predictions import startup_ml_system
        from src.backend.app.services.reroute_service import reroute_scheduler
        await startup_ml_system()
        # Start dynamic reroute loop
        application.state.reroute_task = asyncio.create_task(reroute_scheduler())

    @application.on_event("shutdown")
    async def shutdown_event():
        """Shutdown background tasks cleanly"""
        task = getattr(application.state, "reroute_task", None)
        if task:
            task.cancel()

    return application

app = create_application()
