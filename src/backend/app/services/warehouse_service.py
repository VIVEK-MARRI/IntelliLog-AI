"""
Warehouse assignment service.

Handles:
- Assigning orders to nearest warehouse using haversine distance
- Querying warehouse stats (order/driver counts)
"""

import math
import logging
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session

from src.backend.app.db.models import Warehouse, Order, Driver

logger = logging.getLogger(__name__)


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine distance in km between two lat/lon points."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) *
         math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def find_nearest_warehouse(
    db: Session,
    lat: float,
    lng: float,
    tenant_id: str,
) -> Optional[Warehouse]:
    """
    Find the nearest warehouse to (lat, lng) within its service radius.

    Returns the closest Warehouse or None if none is within range.
    """
    warehouses = db.query(Warehouse).filter(Warehouse.tenant_id == tenant_id).all()
    if not warehouses:
        return None

    best: Optional[Warehouse] = None
    best_dist = float("inf")

    for wh in warehouses:
        dist = haversine(lat, lng, wh.lat, wh.lng)
        if dist <= wh.service_radius_km and dist < best_dist:
            best = wh
            best_dist = dist

    return best


def assign_order_to_warehouse(db: Session, order: Order) -> Optional[str]:
    """
    Auto-assign an order to the nearest warehouse.

    Sets order.warehouse_id and returns the warehouse_id, or None if
    no warehouse is in range.
    """
    wh = find_nearest_warehouse(db, order.lat, order.lng, order.tenant_id)
    if wh:
        order.warehouse_id = wh.id
        logger.info(
            "Order %s assigned to warehouse %s (%.2f km)",
            order.order_number, wh.name,
            haversine(order.lat, order.lng, wh.lat, wh.lng),
        )
        return wh.id
    else:
        logger.warning("No warehouse in range for order %s", order.order_number)
        return None


def get_warehouse_stats(db: Session, warehouse_id: str) -> Dict[str, Any]:
    """Return order and driver counts for a warehouse."""
    order_count = db.query(Order).filter(Order.warehouse_id == warehouse_id).count()
    pending_count = db.query(Order).filter(
        Order.warehouse_id == warehouse_id, Order.status == "pending"
    ).count()
    driver_count = db.query(Driver).filter(Driver.warehouse_id == warehouse_id).count()
    active_drivers = db.query(Driver).filter(
        Driver.warehouse_id == warehouse_id, Driver.status != "offline"
    ).count()

    return {
        "warehouse_id": warehouse_id,
        "total_orders": order_count,
        "pending_orders": pending_count,
        "total_drivers": driver_count,
        "active_drivers": active_drivers,
    }
