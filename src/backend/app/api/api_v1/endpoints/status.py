"""
Status/monitoring endpoint for system health, reroute activity, and logistics metrics.
"""
from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from src.backend.app.api.deps import get_db_session, get_current_tenant
from src.backend.app.db.models import Route, Order, Driver, Warehouse, DeliveryLog
from src.backend.app.core.config import settings

router = APIRouter()


@router.get("/status/system", tags=["Status"])
async def system_status():
    """Get overall system status including rerouting state."""
    return {
        "status": "operational",
        "timestamp": datetime.utcnow().isoformat(),
        "rerouting_enabled": settings.REROUTE_ENABLED,
        "reroute_interval_sec": settings.REROUTE_INTERVAL_SEC,
        "osrm_enabled": bool(settings.OSRM_BASE_URL),
        "version": "2.0.0"
    }


@router.get("/metrics")
def logistics_metrics(
    db: Session = Depends(get_db_session),
    tenant_id: str = Depends(get_current_tenant),
):
    """
    Logistics performance metrics:
    - ETA prediction accuracy (MAE)
    - Route efficiency (avg distance per order)
    - Driver utilization %
    - Delivery success rate
    - Per-warehouse breakdown
    """
    # Driver utilization
    total_drivers = db.query(Driver).filter(Driver.tenant_id == tenant_id).count()
    active_drivers = db.query(Driver).filter(
        Driver.tenant_id == tenant_id, Driver.status != "offline"
    ).count()
    driver_utilization = (active_drivers / max(total_drivers, 1)) * 100

    # Delivery success rate
    total_orders = db.query(Order).filter(Order.tenant_id == tenant_id).count()
    delivered_orders = db.query(Order).filter(
        Order.tenant_id == tenant_id, Order.status == "delivered"
    ).count()
    failed_orders = db.query(Order).filter(
        Order.tenant_id == tenant_id, Order.status == "failed"
    ).count()
    delivery_success_rate = (delivered_orders / max(delivered_orders + failed_orders, 1)) * 100

    # Route efficiency: avg distance per order
    routes = db.query(Route).filter(
        Route.tenant_id == tenant_id,
        Route.status.in_(["active", "completed"]),
    ).all()
    total_distance = sum(r.total_distance_km for r in routes)
    total_route_orders = sum(len(r.orders) for r in routes)
    avg_distance_per_order = total_distance / max(total_route_orders, 1)

    # ETA prediction error (from delivery logs)
    eta_logs = db.query(DeliveryLog).filter(
        DeliveryLog.tenant_id == tenant_id,
        DeliveryLog.predicted_eta_min.isnot(None),
        DeliveryLog.actual_delivery_min.isnot(None),
    ).all()
    if eta_logs:
        eta_mae = sum(
            abs(log.predicted_eta_min - log.actual_delivery_min) for log in eta_logs
        ) / len(eta_logs)
    else:
        eta_mae = None

    # Per-warehouse stats
    warehouses = db.query(Warehouse).filter(Warehouse.tenant_id == tenant_id).all()
    warehouse_stats = []
    for wh in warehouses:
        wh_orders = db.query(Order).filter(Order.warehouse_id == wh.id).count()
        wh_drivers = db.query(Driver).filter(Driver.warehouse_id == wh.id).count()
        wh_pending = db.query(Order).filter(
            Order.warehouse_id == wh.id, Order.status == "pending"
        ).count()
        warehouse_stats.append({
            "id": wh.id,
            "name": wh.name,
            "total_orders": wh_orders,
            "pending_orders": wh_pending,
            "total_drivers": wh_drivers,
        })

    return {
        "timestamp": datetime.utcnow().isoformat(),
        "driver_utilization_pct": round(driver_utilization, 1),
        "delivery_success_rate_pct": round(delivery_success_rate, 1),
        "route_efficiency": {
            "avg_distance_per_order_km": round(avg_distance_per_order, 2),
            "total_routes": len(routes),
            "total_distance_km": round(total_distance, 2),
        },
        "eta_prediction": {
            "mae_minutes": round(eta_mae, 2) if eta_mae else "no data",
            "samples": len(eta_logs),
        },
        "orders": {
            "total": total_orders,
            "delivered": delivered_orders,
            "failed": failed_orders,
            "pending": total_orders - delivered_orders - failed_orders,
        },
        "fleet": {
            "total_drivers": total_drivers,
            "active_drivers": active_drivers,
        },
        "warehouses": warehouse_stats,
    }
