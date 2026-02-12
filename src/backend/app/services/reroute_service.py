"""
Dynamic reroute service — warehouse-aware version.

Re-optimizes routes per-warehouse to avoid recomputing 
unrelated warehouses.
"""

import asyncio
import logging
import threading
from datetime import datetime
from typing import Dict, Any, Optional, List

from sqlalchemy.orm import Session

from src.backend.app.core.config import settings
from src.backend.app.db.base import SessionLocal
from src.backend.app.db.models import Driver, Order, Route, Warehouse
from src.backend.app.services.optimization_service import OptimizationService

logger = logging.getLogger(__name__)


class LiveLocationStore:
    """In-memory live driver locations keyed by tenant -> driver_id."""

    def __init__(self) -> None:
        self._locations: Dict[str, Dict[str, Dict[str, Any]]] = {}
        self._lock = threading.Lock()

    async def update_location(
        self,
        tenant_id: str,
        driver_id: str,
        lat: float,
        lng: float,
        speed_kmph: Optional[float] = None,
    ) -> None:
        with self._lock:
            self._locations.setdefault(tenant_id, {})[driver_id] = {
                "lat": lat,
                "lng": lng,
                "speed_kmph": speed_kmph,
                "ts": datetime.utcnow().isoformat(),
            }

    async def get_location(self, tenant_id: str, driver_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            return self._locations.get(tenant_id, {}).get(driver_id)

    async def get_all_locations(self, tenant_id: str) -> Dict[str, Dict[str, Any]]:
        with self._lock:
            return dict(self._locations.get(tenant_id, {}))

    def get_all_locations_sync(self, tenant_id: str) -> Dict[str, Dict[str, Any]]:
        with self._lock:
            return dict(self._locations.get(tenant_id, {}))


live_location_store = LiveLocationStore()


def _build_drivers_payload(db: Session, tenant_id: str, warehouse_id: str = None) -> List[Dict[str, Any]]:
    query = db.query(Driver).filter(
        Driver.tenant_id == tenant_id, Driver.status != "offline"
    )
    if warehouse_id:
        query = query.filter(Driver.warehouse_id == warehouse_id)
    drivers = query.all()

    payload: List[Dict[str, Any]] = []
    for d in drivers:
        payload.append({
            "driver_id": d.id,
            "current_lat": d.current_lat,
            "current_lng": d.current_lng,
            "vehicle_capacity": d.vehicle_capacity,
            "shift_start": None,
            "shift_end": None,
        })
    return payload


def _sync_driver_positions(db: Session, tenant_id: str, locations: Dict[str, Dict[str, Any]]) -> None:
    if not locations:
        return
    driver_ids = list(locations.keys())
    drivers = db.query(Driver).filter(
        Driver.tenant_id == tenant_id, Driver.id.in_(driver_ids)
    ).all()
    for d in drivers:
        loc = locations.get(d.id)
        if not loc:
            continue
        d.current_lat = loc.get("lat")
        d.current_lng = loc.get("lng")


def _select_orders_for_reroute(db: Session, tenant_id: str, warehouse_id: str = None) -> List[Order]:
    query = db.query(Order).filter(
        Order.tenant_id == tenant_id,
        Order.status.in_(["pending", "assigned"]),
    )
    if warehouse_id:
        query = query.filter(Order.warehouse_id == warehouse_id)
    return query.all()


def _reroute_warehouse(
    db: Session,
    tenant_id: str,
    warehouse_id: str,
    warehouse_coords: tuple,
) -> Dict[str, Any]:
    """Re-optimize routes for a single warehouse."""
    orders = _select_orders_for_reroute(db, tenant_id, warehouse_id)
    if not orders:
        return {"status": "skipped", "reason": "no orders", "warehouse_id": warehouse_id}

    drivers_payload = _build_drivers_payload(db, tenant_id, warehouse_id)
    if not drivers_payload:
        return {"status": "skipped", "reason": "no active drivers", "warehouse_id": warehouse_id}

    solver_orders = []
    for o in orders:
        solver_orders.append({
            "order_id": o.id,
            "lat": o.lat,
            "lon": o.lng,
            "distance_km": None,
            "weight": o.weight,
            "time_window_start": o.time_window_start,
            "time_window_end": o.time_window_end,
            "order_time": o.time_window_start or datetime.utcnow(),
        })

    result = OptimizationService.calculate_routes(
        orders=solver_orders,
        drivers=len(drivers_payload),
        method="ortools",
        use_ml=True,
        drivers_data=drivers_payload,
        avg_speed_kmph=settings.REROUTE_AVG_SPEED_KMPH,
        ortools_time_limit=settings.REROUTE_ORTOOLS_TIME_LIMIT,
        use_osrm=True,
        warehouse_coords=warehouse_coords,
    )

    if not result.get("routes"):
        return {"status": "skipped", "reason": "no routes", "warehouse_id": warehouse_id}

    # Supersede only routes for THIS warehouse
    db.query(Route).filter(
        Route.tenant_id == tenant_id,
        Route.warehouse_id == warehouse_id,
        Route.status.in_(["planned", "active"]),
    ).update({"status": "superseded"}, synchronize_session=False)

    new_routes = []
    for i, route_data in enumerate(result["routes"]):
        if not route_data["route"]:
            continue
        driver_id = drivers_payload[i]["driver_id"] if i < len(drivers_payload) else None
        route = Route(
            tenant_id=tenant_id,
            driver_id=driver_id,
            warehouse_id=warehouse_id,
            total_distance_km=route_data["load"],
            total_duration_min=route_data.get("duration_min", 0.0),
            status="active",
            geometry_json={
                "points": route_data["route"],
                "method": result.get("method"),
                "warehouse_id": warehouse_id,
                "warehouse_coords": list(warehouse_coords),
                "generated_at": datetime.utcnow().isoformat(),
            },
        )
        db.add(route)
        db.flush()
        for order_id in route_data["route"]:
            order = db.query(Order).filter(Order.id == order_id).first()
            if order:
                order.route_id = route.id
                order.status = "assigned"
        new_routes.append(route)

    return {"status": "ok", "routes": len(new_routes), "warehouse_id": warehouse_id}


def reroute_tenant(db: Session, tenant_id: str) -> Dict[str, Any]:
    """
    Re-optimize routes for a tenant, warehouse by warehouse.
    
    Only re-computes warehouses that have pending/assigned orders,
    avoiding unnecessary recomputation of unrelated warehouses.
    """
    # Get warehouses that have pending/assigned orders
    warehouse_ids = (
        db.query(Order.warehouse_id)
        .filter(
            Order.tenant_id == tenant_id,
            Order.status.in_(["pending", "assigned"]),
            Order.warehouse_id.isnot(None),
        )
        .distinct()
        .all()
    )

    results = []
    for (wh_id,) in warehouse_ids:
        wh = db.query(Warehouse).filter(Warehouse.id == wh_id).first()
        if not wh:
            continue
        res = _reroute_warehouse(db, tenant_id, wh_id, (wh.lat, wh.lng))
        results.append(res)

    # Handle orders without warehouse (legacy)
    legacy_orders = _select_orders_for_reroute(db, tenant_id, warehouse_id=None)
    orphan_orders = [o for o in legacy_orders if o.warehouse_id is None]
    if orphan_orders:
        drivers_payload = _build_drivers_payload(db, tenant_id)
        if drivers_payload:
            solver_orders = [{
                "order_id": o.id, "lat": o.lat, "lon": o.lng,
                "distance_km": None, "weight": o.weight,
                "time_window_start": o.time_window_start,
                "time_window_end": o.time_window_end,
                "order_time": o.time_window_start or datetime.utcnow(),
            } for o in orphan_orders]

            result = OptimizationService.calculate_routes(
                orders=solver_orders,
                drivers=len(drivers_payload),
                method="ortools",
                use_ml=True,
                drivers_data=drivers_payload,
                avg_speed_kmph=settings.REROUTE_AVG_SPEED_KMPH,
                ortools_time_limit=settings.REROUTE_ORTOOLS_TIME_LIMIT,
                use_osrm=True,
            )
            results.append({"status": "ok", "legacy_orders": len(orphan_orders)})

    db.commit()
    return {"status": "ok", "warehouse_results": results}


def reroute_all_tenants() -> None:
    db = SessionLocal()
    try:
        tenant_ids = [t[0] for t in db.query(Order.tenant_id).distinct().all()]
        if not tenant_ids:
            return
        for tenant_id in tenant_ids:
            locations = live_location_store.get_all_locations_sync(tenant_id)
            if locations:
                _sync_driver_positions(db, tenant_id, locations)
            reroute_tenant(db, tenant_id)
    finally:
        db.close()


async def reroute_scheduler() -> None:
    """Periodic reroute loop (every REROUTE_INTERVAL_SEC)."""
    while True:
        if settings.REROUTE_ENABLED:
            try:
                await asyncio.to_thread(reroute_all_tenants)
            except Exception as e:
                logger.exception("Dynamic reroute loop failed: %s", e)
        await asyncio.sleep(settings.REROUTE_INTERVAL_SEC)
