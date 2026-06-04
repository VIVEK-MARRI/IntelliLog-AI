"""Central application settings and validation."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Optional


def _load_env_file() -> None:
    env_path = Path(__file__).resolve().parents[2] / ".env"
    if not env_path.exists():
        return

    with env_path.open("r", encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env_file()


@dataclass(frozen=True)
class AppSettings:
    environment: str
    secret_key: str
    jwt_expiration_hours: int
    database_url: str
    redis_url: str
    celery_broker_url: str
    celery_result_backend: str
    skip_external_startup_checks: bool
    rate_limit_auth_per_minute: int
    rate_limit_position_per_minute: int
    rate_limit_copilot_per_minute: int
    rate_limit_ws_per_minute: int
    gemini_api_key: Optional[str]
    prometheus_enabled: bool
    prometheus_auth_token: Optional[str]

    @property
    def jwt_expiration_seconds(self) -> int:
        return self.jwt_expiration_hours * 60 * 60

    def missing_required(self) -> list[str]:
        missing: list[str] = []
        if not self.secret_key:
            missing.append("SECRET_KEY")
        if not self.database_url:
            missing.append("DATABASE_URL")
        if not self.redis_url:
            missing.append("REDIS_URL")
        if self.jwt_expiration_hours <= 0:
            missing.append("JWT_EXPIRATION")
        return missing

    def validate_for_startup(self) -> None:
        missing = self.missing_required()
        if missing:
            raise RuntimeError("Missing required configuration: " + ", ".join(missing))


@lru_cache(maxsize=2)
def get_settings(*, allow_defaults: bool = False) -> AppSettings:
    """Return cached application settings."""
    environment = os.getenv("ENVIRONMENT", "development")

    if allow_defaults:
        secret_key = os.getenv("SECRET_KEY")
        database_url = os.getenv(
            "DATABASE_URL",
            "postgresql+asyncpg://postgres:admin@localhost:5432/intelliglog",
        )
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        celery_broker_url = os.getenv("CELERY_BROKER_URL", redis_url)
        celery_result_backend = os.getenv("CELERY_RESULT_BACKEND", redis_url)
        jwt_expiration_hours = int(os.getenv("JWT_EXPIRATION", "24"))
        rate_limit_auth_per_minute = int(os.getenv("RATE_LIMIT_AUTH_PER_MINUTE", "20"))
        rate_limit_position_per_minute = int(os.getenv("RATE_LIMIT_POSITION_PER_MINUTE", "300"))
        rate_limit_copilot_per_minute = int(os.getenv("RATE_LIMIT_COPILOT_PER_MINUTE", "30"))
        rate_limit_ws_per_minute = int(os.getenv("RATE_LIMIT_WS_PER_MINUTE", "10"))
        gemini_api_key = os.getenv("GEMINI_API_KEY")
        prometheus_enabled = os.getenv("PROMETHEUS_ENABLED", "true").lower() == "true"
        prometheus_auth_token = os.getenv("PROMETHEUS_AUTH_TOKEN")
        if not secret_key:
            raise RuntimeError(
                "SECRET_KEY environment variable is required. "
                "Set SECRET_KEY to a secure random string (e.g., openssl rand -hex 32). "
                "This is a security requirement - no default fallback is provided."
            )
    else:
        secret_key = os.getenv("SECRET_KEY")
        database_url = os.getenv("DATABASE_URL")
        redis_url = os.getenv("REDIS_URL")
        celery_broker_url = os.getenv("CELERY_BROKER_URL", redis_url)
        celery_result_backend = os.getenv("CELERY_RESULT_BACKEND", redis_url)
        jwt_expiration_hours = int(os.getenv("JWT_EXPIRATION", "0"))
        rate_limit_auth_per_minute = int(os.getenv("RATE_LIMIT_AUTH_PER_MINUTE", "20"))
        rate_limit_position_per_minute = int(os.getenv("RATE_LIMIT_POSITION_PER_MINUTE", "300"))
        rate_limit_copilot_per_minute = int(os.getenv("RATE_LIMIT_COPILOT_PER_MINUTE", "30"))
        rate_limit_ws_per_minute = int(os.getenv("RATE_LIMIT_WS_PER_MINUTE", "10"))
        gemini_api_key = os.getenv("GEMINI_API_KEY")
        prometheus_enabled = os.getenv("PROMETHEUS_ENABLED", "true").lower() == "true"
        prometheus_auth_token = os.getenv("PROMETHEUS_AUTH_TOKEN")

        if not secret_key:
            raise RuntimeError(
                "SECRET_KEY environment variable is required. "
                "Set SECRET_KEY to a secure random string (e.g., openssl rand -hex 32)."
            )

    return AppSettings(
        environment=environment,
        secret_key=secret_key,
        jwt_expiration_hours=jwt_expiration_hours,
        database_url=database_url,
        redis_url=redis_url,
        celery_broker_url=celery_broker_url,
        celery_result_backend=celery_result_backend,
        skip_external_startup_checks=os.getenv("SKIP_EXTERNAL_STARTUP_CHECKS", "false").lower() == "true",
        rate_limit_auth_per_minute=rate_limit_auth_per_minute,
        rate_limit_position_per_minute=rate_limit_position_per_minute,
        rate_limit_copilot_per_minute=rate_limit_copilot_per_minute,
        rate_limit_ws_per_minute=rate_limit_ws_per_minute,
        gemini_api_key=gemini_api_key,
        prometheus_enabled=prometheus_enabled,
        prometheus_auth_token=prometheus_auth_token,
    )
