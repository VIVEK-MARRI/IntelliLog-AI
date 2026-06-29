@echo off
set SECRET_KEY=your-super-secret-key-change-in-production-12345678
set SKIP_EXTERNAL_STARTUP_CHECKS=true
set PYTHONPATH=C:\vivek\IntelliLog-AI
set DATABASE_URL=sqlite+aiosqlite:///./test.db
set GEMINI_API_KEY=
set REDIS_URL=
set INTELLILOG_DATABASE_URL=sqlite+aiosqlite:///./test.db
C:\vivek\IntelliLog-AI\.venv\Scripts\python.exe -m uvicorn src.api.main:app --host 0.0.0.0 --port 8100
