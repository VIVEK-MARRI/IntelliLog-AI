@echo off
REM IntelliLog-AI — Local dev Agent Worker (LangGraph)
REM This consumes GPS pings from the Redis Stream "gps_pings" and runs the
REM risk-decision graph (no_action / alert_customer / reroute).
REM
REM Prerequisites:
REM   1. Redis must be running on localhost:6379
REM   2. Backend must be running (_start_api.bat) so DB is seeded
REM   3. .venv must be activated or this script uses it directly

SET SKIP_EXTERNAL_STARTUP_CHECKS=true
SET SECRET_KEY=dev-key-run-project
SET DATABASE_URL=sqlite+aiosqlite:///C:\vivek\IntelliLog-AI\dev.db
SET REDIS_URL=redis://localhost:6379
SET PYTHONPATH=C:\vivek\IntelliLog-AI
SET PYTHONUNBUFFERED=1
SET LOG_LEVEL=INFO

cd /d C:\vivek\IntelliLog-AI
echo [IntelliLog] Starting LangGraph agent worker...
echo [IntelliLog] Redis: %REDIS_URL%
echo [IntelliLog] Watching stream: gps_pings
C:\vivek\IntelliLog-AI\.venv\Scripts\python.exe src\core\agent_worker.py
