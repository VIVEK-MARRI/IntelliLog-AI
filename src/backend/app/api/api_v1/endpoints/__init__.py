"""API endpoint modules."""

from src.backend.app.api.api_v1.endpoints import (
    auth,
    driver_tracking,
    drivers,
    live_reroute,
    orders,
    predictions,
    routes,
    status,
    tenants,
    warehouses,
)

__all__ = [
    "auth",
    "driver_tracking",
    "drivers",
    "live_reroute",
    "orders",
    "predictions",
    "routes",
    "status",
    "tenants",
    "warehouses",
]
