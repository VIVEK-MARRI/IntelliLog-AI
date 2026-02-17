from typing import Any, List
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from src.backend.app.db.base import get_db
from src.backend.app.db.models import Route, Order, Driver, Warehouse
from src.backend.app.schemas import all as schemas
from src.backend.app.api import deps
from src.backend.app.services.optimization_service import OptimizationService

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/", response_model=List[schemas.Route])
def read_routes(
    db: Session = Depends(deps.get_db_session),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    tenant_id: str = Depends(deps.get_current_tenant),
    warehouse_id: str = Query(None),
    status: str = Query(None),
) -> Any:
    """
    Retrieve routes with optional filtering.
    
    - **warehouse_id**: Filter by warehouse
    - **status**: Filter by route status (planned, active, completed, superseded)
    """
    try:
        query = db.query(Route).filter(Route.tenant_id == tenant_id)
        if warehouse_id:
            query = query.filter(Route.warehouse_id == warehouse_id)
        if status:
            query = query.filter(Route.status == status)
        routes = query.offset(skip).limit(limit).all()
        return routes
    except Exception as e:
        logger.error(f"Error retrieving routes: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.post("/optimize", response_model=List[schemas.Route])
def run_optimization(
    *,
    db: Session = Depends(deps.get_db_session),
    tenant_id: str = Depends(deps.get_current_tenant),
    warehouse_id: str = Query(None),
    method: str = Query("ortools", regex="^(greedy|ortools)$"),
    use_ml: bool = Query(True),
    avg_speed_kmph: float = Query(30.0, gt=0),
    ortools_time_limit: int = Query(10, gt=0),
    use_osrm: bool = Query(True),
) -> Any:
    """
    Run route optimization for pending orders and available drivers.

    When warehouse_id is provided:
    - Only orders and drivers assigned to that warehouse are used
    - The warehouse location is the depot (start/end point)

    When warehouse_id is None (backward compatible):
    - All pending orders and active drivers are used
    - Driver GPS positions are used as depot
    """
    try:
        # Resolve warehouse if specified
        warehouse = None
        warehouse_coords = None
        if warehouse_id:
            warehouse = db.query(Warehouse).filter(
                Warehouse.id == warehouse_id, Warehouse.tenant_id == tenant_id
            ).first()
            if not warehouse:
                raise HTTPException(status_code=404, detail="Warehouse not found")
            warehouse_coords = (warehouse.lat, warehouse.lng)

        # 1. Fetch pending orders (scoped to warehouse if provided)
        order_query = db.query(Order).filter(
            Order.tenant_id == tenant_id, Order.status == "pending"
        )
        if warehouse_id:
            order_query = order_query.filter(Order.warehouse_id == warehouse_id)
        orders = order_query.all()

        if not orders:
            raise HTTPException(
                status_code=400, 
                detail=f"No pending orders found for optimization (Warehouse ID: {warehouse_id})"
            )

        # 2. Fetch available drivers (scoped to warehouse if provided)
        driver_query = db.query(Driver).filter(
            Driver.tenant_id == tenant_id, Driver.status != "offline"
        )
        if warehouse_id:
            driver_query = driver_query.filter(Driver.warehouse_id == warehouse_id)
        drivers = driver_query.all()

        if not drivers:
            raise HTTPException(
                status_code=400, 
                detail=f"No active drivers available for optimization (Warehouse ID: {warehouse_id})"
            )

        # 3. Format data for solver
        solver_orders = []
        for o in orders:
            solver_orders.append({
                "order_id": o.id,
                "lat": o.lat,
                "lon": o.lng,
                "distance_km": None,  # Calculated by solver
                "weight": o.weight or 1.0,
                "time_window_start": o.time_window_start,
                "time_window_end": o.time_window_end,
                "order_time": o.time_window_start or datetime.utcnow(),
            })

        drivers_payload = []
        for d in drivers:
            drivers_payload.append({
                "driver_id": d.id,
                "current_lat": d.current_lat or (warehouse.lat if warehouse else 0),
                "current_lng": d.current_lng or (warehouse.lng if warehouse else 0),
                "vehicle_capacity": d.vehicle_capacity or 10,
                "shift_start": None,
                "shift_end": None,
            })

        # 4. Run solver with error handling
        try:
            optimization_result = OptimizationService.calculate_routes(
                orders=solver_orders,
                drivers=len(drivers),
                method=method,
                use_ml=use_ml,
                drivers_data=drivers_payload,
                avg_speed_kmph=avg_speed_kmph,
                ortools_time_limit=ortools_time_limit,
                use_osrm=use_osrm,
                warehouse_coords=warehouse_coords,
            )
        except Exception as e:
            logger.error(f"Optimization engine error: {e}")
            raise HTTPException(status_code=500, detail=f"Optimization engine error: {str(e)}")

        if optimization_result.get("unassigned"):
            logger.warning(
                "Unassigned orders after optimization: %s",
                optimization_result.get("unassigned"),
            )

        # 5. Save results to DB with proper transaction handling
        try:
            new_routes = []
            for i, route_data in enumerate(optimization_result.get("routes", [])):
                if not route_data.get("route"):
                    continue
                    
                driver = drivers[i] if i < len(drivers) else None
                
                route = Route(
                    tenant_id=tenant_id,
                    driver_id=driver.id if driver else None,
                    warehouse_id=warehouse_id,
                    total_distance_km=float(route_data.get("distance_km", 0.0)),
                    total_duration_min=float(route_data.get("duration_min", 0.0)),
                    status="planned",
                    geometry_json={
                        "points": route_data["route"],
                        "method": optimization_result.get("method"),
                        "avg_speed_kmph": optimization_result.get("debug", {}).get("avg_speed_kmph"),
                        "warehouse_id": warehouse_id,
                        "warehouse_coords": [warehouse.lat, warehouse.lng] if warehouse else None,
                    },
                )
                db.add(route)
                db.flush()  # Get route ID

                # Update orders with route_id and status
                for order_id in route_data.get("route", []):
                    order = db.query(Order).filter(Order.id == order_id).first()
                    if order:
                        order.route_id = route.id
                        order.status = "assigned"
                
                new_routes.append(route)

            db.commit()
            logger.info(f"Optimization completed: {len(new_routes)} routes created")
            return new_routes
        except Exception as e:
            db.rollback()
            logger.error(f"Database error saving routes: {e}")
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in optimization: {e}")
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")
