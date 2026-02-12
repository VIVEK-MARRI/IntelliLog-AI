import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from src.backend.app.core.config import settings
from src.backend.app.core.logging import setup_logging

# Configure logging at startup
setup_logging()

def create_application() -> FastAPI:
    application = FastAPI(
        title=settings.PROJECT_NAME,
        openapi_url="/openapi.json",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # Set all CORS enabled origins
    application.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://localhost:3000",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:3000",
            "http://0.0.0.0:5173",
            "http://0.0.0.0:3000",
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
    application.include_router(api_router, prefix=settings.API_V1_STR)
    
    @application.get("/")
    def root():
        return {"message": "Server is running"}

    @application.get("/health")
    def health_check():
        print("Health check endpoint called")
        return {"status": "ok", "project": settings.PROJECT_NAME}
    
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
