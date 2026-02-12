from typing import Optional, List, Dict
from datetime import datetime
from pydantic import BaseModel, EmailStr

# Token
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenPayload(BaseModel):
    sub: Optional[str] = None

# Tenant
class TenantBase(BaseModel):
    name: str
    slug: str
    plan: str = "free"

class TenantCreate(TenantBase):
    pass

class Tenant(TenantBase):
    id: str
    
    class Config:
        from_attributes = True

# Warehouse
class WarehouseBase(BaseModel):
    name: str
    lat: float
    lng: float
    service_radius_km: float = 25.0
    capacity: int = 500

class WarehouseCreate(WarehouseBase):
    pass

class Warehouse(WarehouseBase):
    id: str
    tenant_id: str

    class Config:
        from_attributes = True

# User
class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    is_active: Optional[bool] = True
    is_superuser: bool = False
    role: str = "user"

class UserCreate(UserBase):
    password: str
    tenant_id: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(UserBase):
    id: str
    tenant_id: str
    
    class Config:
        from_attributes = True

# Driver
class DriverBase(BaseModel):
    name: str
    phone: Optional[str] = None
    status: str = "offline"
    current_lat: Optional[float] = None
    current_lng: Optional[float] = None
    vehicle_capacity: int = 10
    warehouse_id: Optional[str] = None

class DriverCreate(DriverBase):
    pass

class Driver(DriverBase):
    id: str
    tenant_id: str

    class Config:
        from_attributes = True

# Order
class OrderBase(BaseModel):
    order_number: str
    customer_name: Optional[str] = None
    delivery_address: str
    lat: float
    lng: float
    weight: float = 1.0
    time_window_start: Optional[datetime] = None
    time_window_end: Optional[datetime] = None
    status: str = "pending"
    warehouse_id: Optional[str] = None

class OrderCreate(OrderBase):
    pass

class Order(OrderBase):
    id: str
    tenant_id: str
    route_id: Optional[str] = None

    class Config:
        from_attributes = True

# Route
class RouteBase(BaseModel):
    status: str = "planned"
    total_distance_km: float = 0.0
    total_duration_min: float = 0.0
    geometry_json: Optional[Dict] = None
    warehouse_id: Optional[str] = None

class RouteCreate(RouteBase):
    driver_id: Optional[str] = None

class Route(RouteBase):
    id: str
    tenant_id: str
    driver_id: Optional[str] = None
    created_at: datetime
    orders: List[Order] = []

    class Config:
        from_attributes = True
