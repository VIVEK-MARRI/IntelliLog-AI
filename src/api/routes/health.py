# src/api/routes/health.py
from fastapi import APIRouter
import psutil

router = APIRouter()

@router.get("/health", summary="Check API Health")
async def health_check():
    cpu = psutil.cpu_percent()
    memory = psutil.virtual_memory().percent
    return {
        "status": "healthy",
        "cpu_usage": f"{cpu}%",
        "memory_usage": f"{memory}%",
        "message": "IntelliLog-AI backend running smoothly 🚀"
    }
