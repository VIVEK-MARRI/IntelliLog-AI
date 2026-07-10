@echo off
REM IntelliLog-AI — Local dev API server
REM Canonical port: 8000 (matches docker-compose.yml, docker-compose.dev.yml,
REM frontend/.env VITE_API_URL, and Dockerfile EXPOSE 8000)
SET SKIP_EXTERNAL_STARTUP_CHECKS=true
SET PROMETHEUS_ENABLED=true
SET SECRET_KEY=dev-key-run-project
SET DATABASE_URL=sqlite+aiosqlite:///C:\vivek\IntelliLog-AI\dev.db
SET PYTHONPATH=C:\vivek\IntelliLog-AI
cd /d C:\vivek\IntelliLog-AI
START "IntelliLogBackend" /SEPARATE /MIN C:\vivek\IntelliLog-AI\.venv\Scripts\uvicorn.exe src.api.main:app --host 0.0.0.0 --port 8000
