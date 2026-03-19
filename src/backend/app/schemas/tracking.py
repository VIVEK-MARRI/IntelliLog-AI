"""Pydantic schemas for real-time driver position tracking."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, validator


class DriverPositionUpdate(BaseModel):
    """Driver position update from mobile app."""

    driver_id: str = Field(..., description="Unique driver identifier")
    latitude: float = Field(..., ge=-90, le=90, description="Latitude coordinate")
    longitude: float = Field(..., ge=-180, le=180, description="Longitude coordinate")
    speed_kmh: float = Field(default=0.0, ge=0, description="Speed in km/h")
    heading_degrees: float = Field(default=0.0, ge=0, le=360, description="Heading in degrees (0-360)")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Position timestamp")
    accuracy_meters: Optional[float] = Field(default=None, ge=0, description="GPS accuracy in meters")

    @validator("latitude", "longitude", pre=True)
    def validate_coordinates(cls, v):
        """Validate coordinates are realistic."""
        return float(v)

    class Config:
        json_schema_extra = {
            "example": {
                "driver_id": "driver-123",
                "latitude": 40.7128,
                "longitude": -74.0060,
                "speed_kmh": 25.5,
                "heading_degrees": 180.0,
                "timestamp": "2026-03-19T14:30:00Z",
            }
        }


class PositionUpdateResponse(BaseModel):
    """Response after position update received."""

    received: bool = Field(True, description="Position received successfully")
    deviation_detected: bool = Field(False, description="Route deviation detected")
    reoptimize_triggered: bool = Field(False, description="Re-routing triggered")
    message: Optional[str] = None


class NearbyDriver(BaseModel):
    """Driver within radius of specified location."""

    driver_id: str
    latitude: float
    longitude: float
    distance_km: float
    last_seen_seconds_ago: int
    status: str = Field(default="active", description="Driver status: active/idle/offline")


class NearbyDriversResponse(BaseModel):
    """Response with list of nearby drivers."""

    drivers: List[NearbyDriver]
    total_count: int
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class PositionBroadcast(BaseModel):
    """Position broadcast to WebSocket clients."""

    type: str = Field("position_update", description="Event type")
    driver_id: str
    latitude: float
    longitude: float
    speed_kmh: float
    heading_degrees: float
    eta_remaining_min: Optional[float] = None
    on_route: bool = True
    last_updated: datetime = Field(default_factory=datetime.utcnow)
    accuracy_meters: Optional[float] = None


class DriverStateSnapshot(BaseModel):
    """Complete driver state for WebSocket on-connect."""

    driver_id: str
    latitude: float
    longitude: float
    speed_kmh: float
    heading_degrees: float
    on_route: bool
    current_route_id: Optional[str] = None
    eta_remaining_min: Optional[float] = None
    deviation_flag: bool = False
    last_updated: datetime


class DeviationAlert(BaseModel):
    """Deviation detection alert."""

    driver_id: str
    deviation_detected: bool
    perpendicular_distance_m: float
    consecutive_deviation_count: int
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    route_id: Optional[str] = None


class WebSocketMessage(BaseModel):
    """Generic WebSocket message format."""

    type: str  # position_update, deviation_alert, reoptimize_triggered, driver_arrived, driver_offline
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    tenant_id: str
    data: dict = Field(default_factory=dict)


class RouteGeometry(BaseModel):
    """GeoJSON LineString representing planned route geometry."""

    type: str = Field("LineString", description="GeoJSON type")
    coordinates: List[tuple] = Field(..., description="List of [lon, lat] coordinates")

    class Config:
        json_schema_extra = {
            "example": {
                "type": "LineString",
                "coordinates": [[-74.0060, 40.7128], [-74.0070, 40.7140], [-74.0080, 40.7150]],
            }
        }
