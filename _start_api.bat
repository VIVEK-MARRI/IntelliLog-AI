@echo off
SET SKIP_EXTERNAL_STARTUP_CHECKS=true
SET PROMETHEUS_ENABLED=true
SET SECRET_KEY=dev-key-run-project
SET DATABASE_URL=sqlite+aiosqlite:///C:\vivek\IntelliLog-AI\dev.db
SET PYTHONPATH=C:\vivek\IntelliLog-AI
cd /d C:\vivek\IntelliLog-AI
START "IntelliLogBackend" /SEPARATE /MIN C:\vivek\IntelliLog-AI\.venv\Scripts\uvicorn.exe src.api.main:app --host 0.0.0.0 --port 8002
