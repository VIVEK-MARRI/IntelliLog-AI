from fastapi import APIRouter, Depends

from src.backend.app.core.auth import get_current_user
from src.backend.app.api.api_v1.endpoints import (
	analytics,
	auth,
	driver_tracking,
	drivers,
	health,
	learning,
	live_reroute,
	orders,
	predictions,
	routes,
	status,
	tenants,
	warehouses,
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(tenants.router, prefix="/tenants", tags=["tenants"], dependencies=[Depends(get_current_user)])
api_router.include_router(warehouses.router, prefix="/warehouses", tags=["warehouses"], dependencies=[Depends(get_current_user)])
api_router.include_router(drivers.router, prefix="/drivers", tags=["drivers"], dependencies=[Depends(get_current_user)])
api_router.include_router(driver_tracking.router, tags=["driver-tracking"])
api_router.include_router(orders.router, prefix="/orders", tags=["orders"])
api_router.include_router(routes.router, prefix="/routes", tags=["routes"])
api_router.include_router(predictions.router, prefix="/ml", tags=["ml-predictions"])
api_router.include_router(predictions.router, prefix="/predictions", tags=["predictions"])
api_router.include_router(live_reroute.router, tags=["live-routing"])
api_router.include_router(status.router, prefix="/status", tags=["status"])
api_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
api_router.include_router(learning.router, prefix="/learning", tags=["learning"])
api_router.include_router(health.router, tags=["health"])
