from fastapi import APIRouter
from src.backend.app.api.api_v1.endpoints import auth, tenants, drivers, orders, routes

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(tenants.router, prefix="/tenants", tags=["tenants"])
api_router.include_router(drivers.router, prefix="/drivers", tags=["drivers"])
api_router.include_router(orders.router, prefix="/orders", tags=["orders"])
api_router.include_router(routes.router, prefix="/routes", tags=["routes"])
