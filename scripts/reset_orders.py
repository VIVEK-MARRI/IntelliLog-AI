import sys
from pathlib import Path
# Set project root (one level up from scripts/)
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from src.backend.app.db.base import SessionLocal
from src.backend.app.db.models import Order, Driver, Warehouse, Route
from datetime import datetime, timedelta

def reset_data():
    db = SessionLocal()
    tenant_id = "default"
    
    # 1. Clear existing warehouses and routes
    # Null out foreign keys first to avoid IntegrityError
    db.query(Order).update({Order.route_id: None, Order.warehouse_id: None})
    db.query(Driver).update({Driver.warehouse_id: None})
    db.query(Route).delete()
    db.query(Warehouse).delete()
    
    # 2. Add Warehouses
    warehouses = [
        Warehouse(
            id="wh-hyd-001",
            name="Hyderabad Central Depot",
            lat=17.3850,
            lng=78.4867,
            service_radius_km=15.0,
            capacity=100,
            tenant_id=tenant_id
        ),
        Warehouse(
            id="wh-blr-001",
            name="Bangalore Whitefield Hub",
            lat=12.9698,
            lng=77.7500,
            service_radius_km=20.0,
            capacity=150,
            tenant_id=tenant_id
        ),
        Warehouse(
            id="wh-hitech-001",
            name="HITEC City Logistics Yard",
            lat=17.4435,
            lng=78.3772,
            service_radius_km=10.0,
            capacity=80,
            tenant_id=tenant_id
        )
    ]
    for wh in warehouses:
        db.add(wh)
    
    # 3. Reset Orders
    # Assign to nearest warehouse and set to pending
    # Use Hyderabad/Bangalore coords to match OSRM and Warehouses
    orders = db.query(Order).all()
    
    # Coordinates for some well known spots in Hyd/Blr
    hyd_spots = [
        (17.4483, 78.3915), # Inorbit Mall
        (17.3984, 78.4908), # Koti
        (17.4399, 78.4983), # Secunderabad
        (17.4156, 78.4750), # Hussain Sagar
        (17.4623, 78.3689), # Kondapur
    ]
    blr_spots = [
        (12.9719, 77.5937), # Cubbon Park
        (12.9698, 77.7500), # Whitefield
        (12.9562, 77.7011), # Marathahalli
        (12.9279, 77.6271), # Koramangala
        (13.0285, 77.5409), # Yeswanthpur
    ]

    for i, o in enumerate(orders):
        o.status = "pending"
        o.route_id = None
        
        # Distribute orders among Hyd and Blr
        if i % 2 == 0:
            spot = hyd_spots[ (i//2) % len(hyd_spots) ]
            o.lat, o.lng = spot
            o.warehouse_id = "wh-hyd-001" if i % 4 == 0 else "wh-hitech-001"
            o.delivery_address = f"Hyd Spot {i}"
        else:
            spot = blr_spots[ (i//2) % len(blr_spots) ]
            o.lat, o.lng = spot
            o.warehouse_id = "wh-blr-001"
            o.delivery_address = f"Blr Spot {i}"
            
    # 4. Reset Drivers
    drivers = db.query(Driver).all()
    for d in drivers:
        d.status = "available"
        if abs(d.current_lat - 17) < 2:
            d.warehouse_id = "wh-hyd-001"
        else:
            d.warehouse_id = "wh-blr-001"
            
    db.commit()
    print(f"Resetted {len(orders)} orders and {len(drivers)} drivers. Seeded {len(warehouses)} warehouses.")
    db.close()

if __name__ == "__main__":
    reset_data()
