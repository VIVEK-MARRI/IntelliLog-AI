from src.backend.app.db.base import SessionLocal
from src.backend.app.db.models import Tenant, Driver, Order, User
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
                hashed_password="hashed_password_here", # In actual app, use pwd_context.hash
                full_name="System Admin",
                role="admin",
                tenant_id=tenant.id
            )
            db.add(user)
            print(f"Created user: {user.email}")

        # 3. Create Drivers
        drivers_data = [
            {"name": "Robert Miller", "phone": "+1-555-0101", "status": "available", "lat": 40.7128, "lng": -74.0060, "capacity": 15},
            {"name": "Sarah Wilson", "phone": "+1-555-0102", "status": "busy", "lat": 40.7306, "lng": -73.9352, "capacity": 20},
            {"name": "Michael Chen", "phone": "+1-555-0103", "status": "available", "lat": 40.7580, "lng": -73.9855, "capacity": 12},
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
                    tenant_id=tenant.id
                )
                db.add(driver)
                print(f"Created driver: {driver.name}")

        # 4. Create Orders
        orders_data = [
            {"num": "ORD-2024-001", "cust": "Walmart Supercenter", "addr": "7770 West Hwy 50, Salida, CO", "lat": 40.7588, "lng": -73.9851, "weight": 5.5},
            {"num": "ORD-2024-002", "cust": "Target Express", "addr": "255 Greenwich St, New York, NY", "lat": 40.7614, "lng": -73.9776, "weight": 2.1},
            {"num": "ORD-2024-003", "cust": "Whole Foods Market", "addr": "10 Columbus Cir, New York, NY", "lat": 40.7681, "lng": -73.9819, "weight": 3.8},
            {"num": "ORD-2024-004", "cust": "CVS Pharmacy", "addr": "200 W End Ave, New York, NY", "lat": 40.7762, "lng": -73.9831, "weight": 1.2},
            {"num": "ORD-2024-005", "cust": "Best Buy", "addr": "529 5th Ave, New York, NY", "lat": 40.7549, "lng": -73.9808, "weight": 8.0},
        ]

        for o in orders_data:
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
                db.add(order)
                print(f"Created order: {order.order_number}")

        # 5. Add NEW PENDING orders for optimization testing
        test_orders = [
            {"num": "ORD-TEST-001", "cust": "Hudson Yards", "addr": "20 Hudson Yards, NY", "lat": 40.7538, "lng": -74.0022, "weight": 4.1},
            {"num": "ORD-TEST-002", "cust": "Bryant Park", "addr": "42nd St, New York, NY", "lat": 40.7536, "lng": -73.9832, "weight": 2.5},
            {"num": "ORD-TEST-003", "cust": "Grand Central", "addr": "89 E 42nd St, NY", "lat": 40.7527, "lng": -73.9772, "weight": 6.2},
            {"num": "ORD-TEST-004", "cust": "Flatiron Building", "addr": "175 5th Ave, NY", "lat": 40.7411, "lng": -73.9897, "weight": 3.3},
        ]

        for o in test_orders:
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
                db.add(order)
                print(f"Created pending test order: {order.order_number}")

        # 6. Add FINAL demo orders for the user to optimize manually
        demo_orders = [
            {"num": "DEMO-001", "cust": "Empire State Building", "addr": "20 W 34th St, NY", "lat": 40.7484, "lng": -73.9857, "weight": 2.2},
            {"num": "DEMO-002", "cust": "Times Square", "addr": "Manhattan, NY 10036", "lat": 40.7580, "lng": -73.9855, "weight": 1.5},
            {"num": "DEMO-003", "cust": "Rockefeller Center", "addr": "45 Rockefeller Plaza, NY", "lat": 40.7587, "lng": -73.9787, "weight": 3.8},
            {"num": "DEMO-004", "cust": "Chrysler Building", "addr": "405 Lexington Ave, NY", "lat": 40.7516, "lng": -73.9754, "weight": 5.1},
        ]

        for o in demo_orders:
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
                db.add(order)
                print(f"Created demo pending order: {order.order_number}")

        db.commit()
        print("Seeding completed successfully!")

    except Exception as e:
        db.rollback()
        print(f"Error during seeding: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_data()
