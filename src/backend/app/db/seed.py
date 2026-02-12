from src.backend.app.db.base import SessionLocal
from src.backend.app.db.models import Tenant, Driver, Order, User, Warehouse
from src.backend.app.services.warehouse_service import assign_order_to_warehouse
from src.backend.app.core.config import settings
import uuid

def seed_data():
    db = SessionLocal()
    try:
        # 1. Create Default Tenant
        tenant = db.query(Tenant).filter(Tenant.slug == "default").first()
        if not tenant:
            tenant = Tenant(
                id="default",
                name="IntelliLog Global",
                slug="default",
                plan="enterprise"
            )
            db.add(tenant)
            db.commit()
            db.refresh(tenant)
            print(f"Created tenant: {tenant.name}")
        else:
            print(f"Tenant already exists: {tenant.name}")

        # 2. Create Default Admin User
        user = db.query(User).filter(User.email == "admin@intellog.ai").first()
        if not user:
            user = User(
                id=str(uuid.uuid4()),
                email="admin@intellog.ai",
                hashed_password="hashed_password_here",
                full_name="System Admin",
                role="admin",
                tenant_id=tenant.id
            )
            db.add(user)
            print(f"Created user: {user.email}")

        # 3. Create Warehouses (Hyderabad + Bangalore)
        warehouses_data = [
            {
                "id": "wh-hyd-central",
                "name": "Hyderabad Central Hub",
                "lat": 17.3850,
                "lng": 78.4867,
                "service_radius_km": 30.0,
                "capacity": 500,
            },
            {
                "id": "wh-hyd-hitec",
                "name": "HITEC City DC",
                "lat": 17.4435,
                "lng": 78.3772,
                "service_radius_km": 25.0,
                "capacity": 400,
            },
            {
                "id": "wh-blr-whitefield",
                "name": "Bangalore Whitefield Hub",
                "lat": 12.9698,
                "lng": 77.7500,
                "service_radius_km": 30.0,
                "capacity": 500,
            },
        ]

        created_warehouses = {}
        for wh_data in warehouses_data:
            wh = db.query(Warehouse).filter(Warehouse.id == wh_data["id"]).first()
            if not wh:
                wh = Warehouse(**wh_data, tenant_id=tenant.id)
                db.add(wh)
                print(f"Created warehouse: {wh.name}")
            else:
                print(f"Warehouse already exists: {wh.name}")
            created_warehouses[wh_data["id"]] = wh_data

        db.commit()

        # 4. Create Drivers (assigned to warehouses)
        drivers_data = [
            # Hyderabad Central Hub drivers
            {"name": "Ravi Kumar", "phone": "+91-9876543101", "status": "available",
             "lat": 17.3850, "lng": 78.4867, "capacity": 15, "warehouse_id": "wh-hyd-central"},
            {"name": "Suresh Reddy", "phone": "+91-9876543102", "status": "busy",
             "lat": 17.3950, "lng": 78.4750, "capacity": 20, "warehouse_id": "wh-hyd-central"},
            # HITEC City DC drivers
            {"name": "Priya Sharma", "phone": "+91-9876543103", "status": "available",
             "lat": 17.4435, "lng": 78.3772, "capacity": 12, "warehouse_id": "wh-hyd-hitec"},
            {"name": "Arun Patel", "phone": "+91-9876543104", "status": "available",
             "lat": 17.4500, "lng": 78.3850, "capacity": 18, "warehouse_id": "wh-hyd-hitec"},
            # Bangalore Whitefield Hub drivers
            {"name": "Karthik Nair", "phone": "+91-9876543105", "status": "available",
             "lat": 12.9698, "lng": 77.7500, "capacity": 15, "warehouse_id": "wh-blr-whitefield"},
            {"name": "Deepa Menon", "phone": "+91-9876543106", "status": "busy",
             "lat": 12.9750, "lng": 77.7400, "capacity": 20, "warehouse_id": "wh-blr-whitefield"},
        ]

        for d in drivers_data:
            driver = db.query(Driver).filter(Driver.name == d["name"]).first()
            if not driver:
                driver = Driver(
                    id=str(uuid.uuid4()),
                    name=d["name"],
                    phone=d["phone"],
                    status=d["status"],
                    current_lat=d["lat"],
                    current_lng=d["lng"],
                    vehicle_capacity=d["capacity"],
                    warehouse_id=d["warehouse_id"],
                    tenant_id=tenant.id
                )
                db.add(driver)
                print(f"Created driver: {driver.name} @ {d['warehouse_id']}")

        db.commit()

        # 5. Create Orders (Hyderabad locations)
        hyderabad_orders = [
            {"num": "ORD-HYD-001", "cust": "Charminar Store", "addr": "Charminar, Hyderabad",
             "lat": 17.3616, "lng": 78.4747, "weight": 5.5},
            {"num": "ORD-HYD-002", "cust": "Tank Bund Office", "addr": "Tank Bund Rd, Hyderabad",
             "lat": 17.4239, "lng": 78.4738, "weight": 2.1},
            {"num": "ORD-HYD-003", "cust": "Gachibowli TechPark", "addr": "Gachibowli, Hyderabad",
             "lat": 17.4401, "lng": 78.3489, "weight": 3.8},
            {"num": "ORD-HYD-004", "cust": "Banjara Hills Residence", "addr": "Banjara Hills, Hyderabad",
             "lat": 17.4156, "lng": 78.4347, "weight": 1.2},
            {"num": "ORD-HYD-005", "cust": "Kukatpally Mall", "addr": "Kukatpally, Hyderabad",
             "lat": 17.4849, "lng": 78.3942, "weight": 8.0},
            {"num": "ORD-HYD-006", "cust": "LB Nagar Shop", "addr": "LB Nagar, Hyderabad",
             "lat": 17.3457, "lng": 78.5522, "weight": 4.1},
            {"num": "ORD-HYD-007", "cust": "Madhapur Hub", "addr": "Madhapur, Hyderabad",
             "lat": 17.4400, "lng": 78.3918, "weight": 2.5},
            {"num": "ORD-HYD-008", "cust": "Secunderabad Station", "addr": "Secunderabad, Hyderabad",
             "lat": 17.4344, "lng": 78.5013, "weight": 6.2},
            {"num": "ORD-HYD-009", "cust": "Ameerpet Center", "addr": "Ameerpet, Hyderabad",
             "lat": 17.4375, "lng": 78.4483, "weight": 3.3},
        ]

        # Bangalore orders
        bangalore_orders = [
            {"num": "ORD-BLR-001", "cust": "MG Road Showroom", "addr": "MG Road, Bangalore",
             "lat": 12.9716, "lng": 77.6198, "weight": 3.0},
            {"num": "ORD-BLR-002", "cust": "Koramangala Office", "addr": "Koramangala, Bangalore",
             "lat": 12.9279, "lng": 77.6271, "weight": 4.5},
            {"num": "ORD-BLR-003", "cust": "Electronic City Hub", "addr": "Electronic City, Bangalore",
             "lat": 12.8440, "lng": 77.6778, "weight": 7.2},
            {"num": "ORD-BLR-004", "cust": "Indiranagar Cafe", "addr": "Indiranagar, Bangalore",
             "lat": 12.9719, "lng": 77.6412, "weight": 1.8},
            {"num": "ORD-BLR-005", "cust": "Marathahalli Tech", "addr": "Marathahalli, Bangalore",
             "lat": 12.9591, "lng": 77.6974, "weight": 5.5},
            {"num": "ORD-BLR-006", "cust": "HSR Layout Home", "addr": "HSR Layout, Bangalore",
             "lat": 12.9116, "lng": 77.6389, "weight": 2.8},
        ]

        all_orders = hyderabad_orders + bangalore_orders

        for o in all_orders:
            order = db.query(Order).filter(Order.order_number == o["num"]).first()
            if not order:
                order = Order(
                    id=str(uuid.uuid4()),
                    order_number=o["num"],
                    customer_name=o["cust"],
                    delivery_address=o["addr"],
                    lat=o["lat"],
                    lng=o["lng"],
                    weight=o["weight"],
                    status="pending",
                    tenant_id=tenant.id
                )
                # Auto-assign to nearest warehouse
                assign_order_to_warehouse(db, order)
                db.add(order)
                print(f"Created order: {order.order_number} → warehouse: {order.warehouse_id}")

        db.commit()
        print("Seeding completed successfully!")

    except Exception as e:
        db.rollback()
        print(f"Error during seeding: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    seed_data()
