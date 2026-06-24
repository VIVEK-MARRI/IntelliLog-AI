"""
System Health router.
Exposes Prometheus-derived observability data for the System Health Center.
"""

from fastapi import APIRouter, Depends

from src.api.auth import AuthenticatedTenant, get_current_tenant
from src.api.services.system_health import get_system_health

router = APIRouter(tags=["system"], prefix="/system")


@router.get("/health")
async def system_health(
    current_tenant: AuthenticatedTenant = Depends(get_current_tenant),
) -> dict:
    """Return comprehensive system health from in-process Prometheus metrics."""
    return await get_system_health()
