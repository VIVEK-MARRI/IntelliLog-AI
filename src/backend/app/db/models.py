import uuid
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Float, JSON, Text
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from src.backend.app.db.base import Base

def generate_uuid():
    return str(uuid.uuid4())

class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, index=True, nullable=False)
    plan = Column(String, default="free")
    created_at = Column(DateTime, default=datetime.utcnow)
    
    users = relationship("User", back_populates="tenant")
    warehouses = relationship("Warehouse", back_populates="tenant")
    drivers = relationship("Driver", back_populates="tenant")
    orders = relationship("Order", back_populates="tenant")
    routes = relationship("Route", back_populates="tenant")

class Warehouse(Base):
    __tablename__ = "warehouses"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    service_radius_km = Column(Float, default=25.0)
    capacity = Column(Integer, default=500)  # max orders per day
    created_at = Column(DateTime, default=datetime.utcnow)

    tenant_id = Column(String, ForeignKey("tenants.id"))
    tenant = relationship("Tenant", back_populates="warehouses")

    drivers = relationship("Driver", back_populates="warehouse")
    orders = relationship("Order", back_populates="warehouse")
    routes = relationship("Route", back_populates="warehouse")

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    role = Column(String, default="user")  # admin, manager, dispatcher
    
    tenant_id = Column(String, ForeignKey("tenants.id"))
    tenant = relationship("Tenant", back_populates="users")

class Driver(Base):
    __tablename__ = "drivers"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    status = Column(String, default="offline")  # available, busy, offline
    current_lat = Column(Float, nullable=True)
    current_lng = Column(Float, nullable=True)
    vehicle_capacity = Column(Integer, default=10)
    
    tenant_id = Column(String, ForeignKey("tenants.id"))
    tenant = relationship("Tenant", back_populates="drivers")

    warehouse_id = Column(String, ForeignKey("warehouses.id"), nullable=True)
    warehouse = relationship("Warehouse", back_populates="drivers")

class Order(Base):
    __tablename__ = "orders"

    id = Column(String, primary_key=True, default=generate_uuid)
    order_number = Column(String, unique=True, index=True)
    customer_name = Column(String, nullable=True)
    delivery_address = Column(String, nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    weight = Column(Float, default=1.0)
    time_window_start = Column(DateTime, nullable=True)
    time_window_end = Column(DateTime, nullable=True)
    status = Column(String, default="pending")  # pending, assigned, delivered, failed
    
    tenant_id = Column(String, ForeignKey("tenants.id"))
    tenant = relationship("Tenant", back_populates="orders")
    
    route_id = Column(String, ForeignKey("routes.id"), nullable=True)
    route = relationship("Route", back_populates="orders")

    warehouse_id = Column(String, ForeignKey("warehouses.id"), nullable=True)
    warehouse = relationship("Warehouse", back_populates="orders")

class Route(Base):
    __tablename__ = "routes"

    id = Column(String, primary_key=True, default=generate_uuid)
    status = Column(String, default="planned")  # planned, active, completed, superseded
    total_distance_km = Column(Float, default=0.0)
    total_duration_min = Column(Float, default=0.0)
    geometry_json = Column(JSON, nullable=True) # Full path geometry
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    driver_id = Column(String, ForeignKey("drivers.id"), nullable=True)
    driver = relationship("Driver")
    
    tenant_id = Column(String, ForeignKey("tenants.id"))
    tenant = relationship("Tenant", back_populates="routes")

    warehouse_id = Column(String, ForeignKey("warehouses.id"), nullable=True)
    warehouse = relationship("Warehouse", back_populates="routes")

    orders = relationship("Order", back_populates="route")

class DeliveryLog(Base):
    __tablename__ = "delivery_logs"

    id = Column(String, primary_key=True, default=generate_uuid)
    order_id = Column(String, ForeignKey("orders.id"))
    driver_id = Column(String, ForeignKey("drivers.id"))
    warehouse_id = Column(String, ForeignKey("warehouses.id"), nullable=True)
    predicted_eta_min = Column(Float, nullable=True)
    actual_delivery_min = Column(Float, nullable=True)
    distance_km = Column(Float, nullable=True)
    delivered_at = Column(DateTime, default=datetime.utcnow)
    tenant_id = Column(String, ForeignKey("tenants.id"))
