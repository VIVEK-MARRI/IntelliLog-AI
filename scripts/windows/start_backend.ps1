$env:SKIP_EXTERNAL_STARTUP_CHECKS = "true"
$env:PROMETHEUS_ENABLED = "true"
$env:SECRET_KEY = "dev-key-run-project"
$env:DATABASE_URL = "sqlite+aiosqlite:///C:\vivek\IntelliLog-AI\dev.db"
$env:PYTHONPATH = "C:\vivek\IntelliLog-AI"
Set-Location "C:\vivek\IntelliLog-AI"
& "C:\vivek\IntelliLog-AI\.venv\Scripts\uvicorn.exe" src.api.main:app --host 0.0.0.0 --port 8002
