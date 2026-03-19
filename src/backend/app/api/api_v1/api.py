from fastapi import APIRouter, Depends

from src.backend.app.core.auth import get_current_user
from src.backend.app.api.api_v1.endpoints import auth, tenants, drivers, orders, routes, predictions, live_reroute, status, warehouses, driver_tracking

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(tenants.router, prefix="/tenants", tags=["tenants"], dependencies=[Depends(get_current_user)])
api_router.include_router(warehouses.router, prefix="/warehouses", tags=["warehouses"], dependencies=[Depends(get_current_user)])
api_router.include_router(drivers.router, prefix="/drivers", tags=["drivers"], dependencies=[Depends(get_current_user)])
api_router.include_router(driver_tracking.router, tags=["driver-tracking"], dependencies=[Depends(get_current_user)])
api_router.include_router(orders.router, prefix="/orders", tags=["orders"], dependencies=[Depends(get_current_user)])
api_router.include_router(routes.router, prefix="/routes", tags=["routes"], dependencies=[Depends(get_current_user)])
api_router.include_router(predictions.router, prefix="/ml", tags=["ml-predictions"], dependencies=[Depends(get_current_user)])
api_router.include_router(live_reroute.router, tags=["live-routing"], dependencies=[Depends(get_current_user)])
api_router.include_router(status.router, prefix="/status", tags=["status"], dependencies=[Depends(get_current_user)])
