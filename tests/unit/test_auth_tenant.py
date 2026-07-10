"""Unit tests for tenant identity consistency between REST and WebSocket auth.

Audit Tier 1 defect #1: the WebSocket router previously hardcoded a different
tenant UUID than REST auth, so live updates never reached the client. Both
paths must now resolve to the same tenant id in dev mode (and the JWT sub in
production). This test locks that contract in place.
"""
import types

from src.api.auth import get_current_tenant, get_current_tenant_ws


def _fake_request() -> types.SimpleNamespace:
    return types.SimpleNamespace(state=types.SimpleNamespace(), headers={})


def test_rest_and_ws_agree_in_dev_mode():
    rest = _run(get_current_tenant(request=_fake_request()))
    ws = _run(get_current_tenant_ws(request=_fake_request()))

    assert rest.tenant_id == ws.tenant_id, "REST and WS must resolve the same tenant"
    assert rest.tenant_id == "dev-tenant-id", "dev mode must use the single dev tenant"


def _run(coro):
    import asyncio

    return asyncio.get_event_loop().run_until_complete(coro)
