from fastapi import APIRouter
from sqlalchemy import text
import redis as redis_lib

from src.backend.app.db.base import SessionLocal
from src.backend.app.core.config import settings

router = APIRouter()


@router.get("/health")
async def get_health():
    health = {
        "api": "healthy",
        "database": "unhealthy",
        "redis": "unhealthy",
        "celery": "unknown",
        "modelServer": "unknown",
        "workerCount": 0,
    }

    # Check database
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        health["database"] = "healthy"
    except Exception:
        pass

    # Check Redis
    try:
        r = redis_lib.from_url(settings.REDIS_FEATURE_STORE_URL)
        r.ping()
        health["redis"] = "healthy"
    except Exception:
        pass

    # Check Celery workers
    try:
        from src.backend.worker.celery_app import celery_app

        inspect = celery_app.control.inspect(timeout=2.0)
        active = inspect.active()
        if active:
            health["celery"] = "healthy"
            health["workerCount"] = len(active)
        else:
            health["celery"] = "degraded"
    except Exception:
        health["celery"] = "degraded"

    # Check model server (MLflow)
    try:
        import mlflow

        client = mlflow.MlflowClient()
        if hasattr(client, "search_experiments"):
            client.search_experiments(max_results=1)
        else:
            client.list_experiments()
        health["modelServer"] = "healthy"
    except Exception:
        health["modelServer"] = "degraded"

    return health
