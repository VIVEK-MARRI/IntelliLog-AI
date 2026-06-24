"""Quick health endpoint test."""
import asyncio
import httpx
from src.api.main import app


async def test():
    async with httpx.AsyncClient(app=app) as c:
        r = await c.get("/health/live")
        print(f"health/live: {r.status_code} {r.text}")
        r2 = await c.get("/metrics")
        print(f"metrics: {r2.status_code} ({len(r2.text)} bytes)")
        r3 = await c.get("/docs")
        print(f"docs: {r3.status_code} ({len(r3.text)} bytes)")


asyncio.run(test())
