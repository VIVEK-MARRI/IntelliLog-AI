import asyncio

import pytest


async def test_copilot_delay_analysis_smoke(api_client, auth_headers, tenant_id):
    payload = {"query": "Why are deliveries delayed today?", "context": {}}
    resp = await api_client.post("/api/v1/copilot/query", json=payload, headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "summary" in body
    assert "evidence" in body
    assert isinstance(body["evidence"], list)
    assert "recommendations" in body
