from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.backend.app.db.base import get_db
from src.backend.app.db.models import Route, Order, Driver
from src.backend.app.schemas import all as schemas
from src.backend.app.api import deps
from src.backend.app.services.optimization_service import OptimizationService

router = APIRouter()

@router.get("/", response_model=List[schemas.Route])
def read_routes(
    db: Session = Depends(deps.get_db_session),
    skip: int = 0,
    limit: int = 100,
    tenant_id: str = Depends(deps.get_current_tenant),
) -> Any:
    """
    Retrieve routes.
    """
    routes = db.query(Route).filter(Route.tenant_id == tenant_id).offset(skip).limit(limit).all()
    return routes

@router.post("/optimize", response_model=List[schemas.Route])
def run_optimization(
    *,
    db: Session = Depends(deps.get_db_session),
    tenant_id: str = Depends(deps.get_current_tenant),
) -> Any:
    """
    Run route optimization for all pending orders and assigned drivers.
    """
    # 1. Fetch pending orders
    orders = db.query(Order).filter(Order.tenant_id == tenant_id, Order.status == "pending").all()
    if not orders:
        raise HTTPException(status_code=400, detail="No pending orders found for optimization")

    # 2. Fetch available drivers
    drivers = db.query(Driver).filter(Driver.tenant_id == tenant_id, Driver.status != "offline").all()
    if not drivers:
        raise HTTPException(status_code=400, detail="No active drivers available")

    # 3. Format data for solver
    solver_orders = []
    for o in orders:
        solver_orders.append({
            "order_id": o.id,
            "lat": o.lat,
            "lon": o.lng,
            "distance_km": 0.0, # Will be calculated by solver matrix
            "weight": o.weight
        })

    # 4. Run solver
    try:
        optimization_result = OptimizationService.calculate_routes(
            orders=solver_orders,
            drivers=len(drivers),
            method="ortools" # Use OR-Tools by default
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Optimization engine error: {str(e)}")

    # 5. Save results to DB
    new_routes = []
    for i, route_data in enumerate(optimization_result["routes"]):
        if not route_data["route"]:
            continue
            
        driver = drivers[i] if i < len(drivers) else None
        
        route = Route(
            tenant_id=tenant_id,
            driver_id=driver.id if driver else None,
            total_distance_km=route_data["load"],
            status="planned",
            geometry_json={"points": route_data["route"]} # Simplified geometry for now
        )
        db.add(route)
        db.flush() # Get route ID

        # Update orders with route_id and status
        for order_id in route_data["route"]:
            order = db.query(Order).filter(Order.id == order_id).first()
            if order:
                order.route_id = route.id
                order.status = "assigned"
        
        new_routes.append(route)

    db.commit()
    return new_routes
