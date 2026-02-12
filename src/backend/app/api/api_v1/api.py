from fastapi import APIRouter
from src.backend.app.api.api_v1.endpoints import auth, tenants, drivers, orders, routes, predictions, live_reroute, status, warehouses

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(tenants.router, prefix="/tenants", tags=["tenants"])
api_router.include_router(warehouses.router, prefix="/warehouses", tags=["warehouses"])
api_router.include_router(drivers.router, prefix="/drivers", tags=["drivers"])
api_router.include_router(orders.router, prefix="/orders", tags=["orders"])
api_router.include_router(routes.router, prefix="/routes", tags=["routes"])
api_router.include_router(predictions.router, prefix="/ml", tags=["ml-predictions"])
api_router.include_router(live_reroute.router, tags=["live-routing"])
api_router.include_router(status.router, prefix="/status", tags=["status"])
