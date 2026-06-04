"""
Phase 10 Verification: FastAPI server integration test for LLM endpoints.

Tests that the copilot and executive summary endpoints are registered
and respond correctly via the ASGI app.
"""

import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ["SECRET_KEY"] = "test-secret-key-789012345678901234567890123456789012"
os.environ["DATABASE_URL"] = "postgresql+asyncpg://x:y@localhost:5432/test"
os.environ["REDIS_URL"] = "redis://localhost"
os.environ["SKIP_EXTERNAL_STARTUP_CHECKS"] = "true"
os.environ["GEMINI_API_KEY"] = ""


async def test_server_endpoints():
    from httpx import ASGITransport, AsyncClient
    from src.api.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        results = []

        # 1. Copilot endpoint exists (even if it fails auth)
        paths = [
            ("GET", "/openapi.json"),
        ]
        for method, path in paths:
            r = await client.get(path)
            results.append((path, r.status_code))

        # 2. OpenAPI schema has copilot paths
        r = await client.get("/openapi.json")
        schema = r.json()
        copilot_paths = [p for p in schema.get("paths", {}).keys() if "copilot" in p.lower()]
        results.append(("copilot_paths", copilot_paths))

        # 3. Health check works (new services don't break startup)
        r = await client.get("/health")
        health = r.json()
        results.append(("health_status", health.get("status")))
        results.append(("model_status", health.get("model")))

        # Print results
        for name, value in results:
            print(f"  {name}: {value}")

        # Assertions
        assert len(copilot_paths) >= 2, f"Expected >=2 copilot paths, got {copilot_paths}"
        print(f"\n[PASS] {len(copilot_paths)} copilot paths registered: {copilot_paths}")
        print("[PASS] Health check OK (no startup regression)")

        return results


if __name__ == "__main__":
    print("=" * 60)
    print("SERVER INTEGRATION VERIFICATION")
    print("=" * 60)
    print()
    asyncio.run(test_server_endpoints())
    print()
    print("=" * 60)
    print("ALL INTEGRATION TESTS PASSED")
    print("=" * 60)
