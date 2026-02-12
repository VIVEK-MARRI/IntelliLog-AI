import os
from pydantic import PostgresDsn
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "IntelliLog-AI SaaS"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "change_this_secret_in_prod")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8  # 8 days
    
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "postgres")
    POSTGRES_SERVER: str = os.getenv("POSTGRES_SERVER", "localhost")
    POSTGRES_PORT: str = os.getenv("POSTGRES_PORT", "5433")  # Changed from 5432 to 5433 for local development
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "intellog")
    
    SQLALCHEMY_DATABASE_URI: str | None = os.getenv("DATABASE_URL")
    if not SQLALCHEMY_DATABASE_URI:
        SQLALCHEMY_DATABASE_URI = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_SERVER}:{POSTGRES_PORT}/{POSTGRES_DB}"

    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # OSRM Routing (road network travel times)
    OSRM_BASE_URL: str = os.getenv("OSRM_BASE_URL", "http://localhost:5001")
    OSRM_PROFILE: str = os.getenv("OSRM_PROFILE", "driving")
    OSRM_TIMEOUT_SEC: int = int(os.getenv("OSRM_TIMEOUT_SEC", "10"))
    OSRM_MAX_POINTS: int = int(os.getenv("OSRM_MAX_POINTS", "100"))
    OSRM_FALLBACK_HAVERSINE: bool = os.getenv("OSRM_FALLBACK_HAVERSINE", "true").lower() == "true"

    # Dynamic rerouting
    REROUTE_ENABLED: bool = os.getenv("REROUTE_ENABLED", "true").lower() == "true"
    REROUTE_INTERVAL_SEC: int = int(os.getenv("REROUTE_INTERVAL_SEC", "60"))
    REROUTE_AVG_SPEED_KMPH: float = float(os.getenv("REROUTE_AVG_SPEED_KMPH", "30"))
    REROUTE_ORTOOLS_TIME_LIMIT: int = int(os.getenv("REROUTE_ORTOOLS_TIME_LIMIT", "10"))
    
    # Model path - works for both local and Docker
    MODEL_PATH: str = os.getenv("MODEL_PATH", "models/xgb_delivery_time_model.pkl")

    # Learning system configuration
    AUTO_RETRAIN_ENABLED: bool = os.getenv("AUTO_RETRAIN_ENABLED", "true").lower() == "true"
    RETRAIN_SCHEDULE_CRON: str = os.getenv("RETRAIN_SCHEDULE_CRON", "0 2 * * 0")
    DRIFT_DETECTION_ENABLED: bool = os.getenv("DRIFT_DETECTION_ENABLED", "true").lower() == "true"
    DRIFT_SCORE_THRESHOLD: float = float(os.getenv("DRIFT_SCORE_THRESHOLD", "0.3"))
    DRIFT_CHECK_INTERVAL_HOURS: int = int(os.getenv("DRIFT_CHECK_INTERVAL_HOURS", "24"))

    # Celery configuration
    CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", REDIS_URL)
    CELERY_RESULT_BACKEND: str = os.getenv("CELERY_RESULT_BACKEND", REDIS_URL)
    CELERY_TIMEZONE: str = os.getenv("CELERY_TIMEZONE", "UTC")
    CELERY_ENABLE_UTC: bool = os.getenv("CELERY_ENABLE_UTC", "true").lower() == "true"

    class Config:
        case_sensitive = True

settings = Settings()
