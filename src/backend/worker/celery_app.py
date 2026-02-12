from celery import Celery
from celery.schedules import crontab
from src.backend.app.core.config import settings

celery_app = Celery(
    "worker",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND
)

celery_app.conf.task_routes = {
    "src.backend.worker.tasks.optimize_route_task": "main-queue",
}

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone=settings.CELERY_TIMEZONE,
    enable_utc=settings.CELERY_ENABLE_UTC,
)


def _parse_cron(expr: str) -> dict:
    parts = expr.split()
    if len(parts) != 5:
        raise ValueError("RETRAIN_SCHEDULE_CRON must have 5 fields")
    minute, hour, day_of_month, month_of_year, day_of_week = parts
    return {
        "minute": minute,
        "hour": hour,
        "day_of_month": day_of_month,
        "month_of_year": month_of_year,
        "day_of_week": day_of_week,
    }


if settings.AUTO_RETRAIN_ENABLED:
    schedule = _parse_cron(settings.RETRAIN_SCHEDULE_CRON)
    celery_app.conf.beat_schedule = {
        "retrain-eta-model": {
            "task": "src.backend.worker.tasks.retrain_eta_model_task",
            "schedule": crontab(**schedule),
        },
        "drift-check": {
            "task": "src.backend.worker.tasks.drift_check_task",
            "schedule": crontab(minute=0, hour=f"*/{settings.DRIFT_CHECK_INTERVAL_HOURS}"),
        },
    }
