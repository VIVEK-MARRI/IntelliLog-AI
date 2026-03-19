import re
import uuid
from typing import Optional, List, Dict
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, field_validator


HTML_TAG_RE = re.compile(r"<[^>]+>")


def _validate_uuid4(value: Optional[str], field_name: str) -> Optional[str]:
    if value is None:
        return value
    try:
        parsed = uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"{field_name} must be a valid UUID4") from exc
    if parsed.version != 4:
        raise ValueError(f"{field_name} must be a valid UUID4")
    return str(parsed)

# Token
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenPayload(BaseModel):
    sub: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str

# Auth Response
class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    user: Dict

class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    user: Dict

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

    @field_validator("lat")
    @classmethod
    def validate_lat(cls, v: float) -> float:
        if not -90 <= v <= 90:
            raise ValueError("Latitude must be between -90 and 90")
        return v

    @field_validator("lng")
    @classmethod
    def validate_lng(cls, v: float) -> float:
        if not -180 <= v <= 180:
            raise ValueError("Longitude must be between -180 and 180")
        return v

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
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters")
    tenant_id: str

    @field_validator("tenant_id")
    @classmethod
    def validate_tenant_id(cls, v: str) -> str:
        return _validate_uuid4(v, "tenant_id") or v

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    full_name: Optional[str]
    role: str
    tenant_id: str
    is_active: bool
    is_superuser: bool
    
    class Config:
        from_attributes = True

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

    @field_validator("current_lat")
    @classmethod
    def validate_current_lat(cls, v: Optional[float]) -> Optional[float]:
        if v is None:
            return v
        if not -90 <= v <= 90:
            raise ValueError("Latitude must be between -90 and 90")
        return v

    @field_validator("current_lng")
    @classmethod
    def validate_current_lng(cls, v: Optional[float]) -> Optional[float]:
        if v is None:
            return v
        if not -180 <= v <= 180:
            raise ValueError("Longitude must be between -180 and 180")
        return v

    @field_validator("warehouse_id")
    @classmethod
    def validate_warehouse_id(cls, v: Optional[str]) -> Optional[str]:
        return _validate_uuid4(v, "warehouse_id")

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

    @field_validator("delivery_address")
    @classmethod
    def sanitize_address(cls, v: str) -> str:
        stripped = HTML_TAG_RE.sub("", v).strip()
        if len(stripped) > 500:
            raise ValueError("delivery_address must be 500 characters or fewer")
        if not stripped:
            raise ValueError("delivery_address is required")
        return stripped

    @field_validator("lat")
    @classmethod
    def validate_lat(cls, v: float) -> float:
        if not -90 <= v <= 90:
            raise ValueError("Latitude must be between -90 and 90")
        return v

    @field_validator("lng")
    @classmethod
    def validate_lng(cls, v: float) -> float:
        if not -180 <= v <= 180:
            raise ValueError("Longitude must be between -180 and 180")
        return v

    @field_validator("warehouse_id")
    @classmethod
    def validate_warehouse_id(cls, v: Optional[str]) -> Optional[str]:
        return _validate_uuid4(v, "warehouse_id")

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
    matrix_type: str = "static_fallback"
    total_distance_km: float = 0.0
    total_duration_min: float = 0.0
    geometry_json: Optional[Dict] = None
    warehouse_id: Optional[str] = None

class RouteCreate(RouteBase):
    driver_id: Optional[str] = None

    @field_validator("driver_id")
    @classmethod
    def validate_driver_id(cls, v: Optional[str]) -> Optional[str]:
        return _validate_uuid4(v, "driver_id")

class Route(RouteBase):
    id: str
    tenant_id: str
    driver_id: Optional[str] = None
    created_at: datetime
    orders: List[Order] = []

    class Config:
        from_attributes = True
