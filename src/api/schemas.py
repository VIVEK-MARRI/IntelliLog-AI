"""
Pydantic models for request/response validation.
Uses camelCase for API responses (common in React frontends).
"""

from datetime import datetime
from enum import Enum
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class RiskLevel(str, Enum):
    """Risk levels for deliveries."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class OrderStatus(str, Enum):
    """Order statuses."""

    PENDING = "pending"
    ACTIVE = "active"
    IN_TRANSIT = "in_transit"
    COMPLETED = "completed"
    FAILED = "failed"


class DecisionType(str, Enum):
    """Agent decision types."""

    NO_ACTION = "no_action"
    ALERT = "alert"
    REROUTE = "reroute"


# ============================================================================
# POSITION & LOCATION
# ============================================================================


class PositionUpdateRequest(BaseModel):
    """GPS position update from driver."""

    latitude: float = Field(..., ge=-90, le=90, alias="lat")
    longitude: float = Field(..., ge=-180, le=180, alias="lng")
    speed_kmh: float = Field(default=0.0, ge=0.0)
    heading: float = Field(default=0.0, ge=0, le=360)
    event_type: str = Field(default="gps_ping")  # "gps_ping", "geofence_entry", etc.

    model_config = ConfigDict(populate_by_name=True, alias_generator=lambda field_name: field_name)


class PositionUpdateResponse(BaseModel):
    """Response to GPS position update."""

    received: bool
    currentRiskScore: float = Field(alias="current_risk_score")
    requestId: str = Field(alias="request_id")

    model_config = ConfigDict(populate_by_name=True)


class Waypoint(BaseModel):
    """A stop on a route."""

    stopId: str = Field(alias="stop_id")
    latitude: float = Field(alias="latitude")
    longitude: float = Field(alias="longitude")
    sequence: int
    serviceDurationMinutes: float = Field(alias="service_duration_minutes")
    address: Optional[str] = None
    customerName: Optional[str] = Field(default=None, alias="customer_name")

    model_config = ConfigDict(populate_by_name=True)


# ============================================================================
# ORDERS
# ============================================================================


class CreateOrderRequest(BaseModel):
    """Create new order."""

    orderId: str = Field(alias="order_id")
    driverId: str = Field(alias="driver_id")
    plannedEta: datetime = Field(alias="planned_eta")
    stops: List[dict]  # Details of delivery stops
    notes: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class OrderResponse(BaseModel):
    """Order response with current state."""

    orderId: str = Field(alias="order_id")
    driverId: str = Field(alias="driver_id")
    tenantId: str = Field(alias="tenant_id")
    status: OrderStatus
    plannedEta: datetime = Field(alias="planned_eta")
    currentEta: datetime = Field(alias="current_eta")
    currentRiskScore: float = Field(alias="current_risk_score")
    riskLevel: RiskLevel = Field(alias="risk_level")
    latitude: float
    longitude: float
    speed: float
    stopsRemaining: int = Field(alias="stops_remaining")
    createdAt: datetime = Field(alias="created_at")
    updatedAt: datetime = Field(alias="updated_at")

    model_config = ConfigDict(populate_by_name=True)


class OrderListResponse(BaseModel):
    """Paginated list of orders."""

    items: List[OrderResponse]
    totalCount: int = Field(alias="total_count")
    page: int
    pageSize: int = Field(alias="page_size")
    hasNext: bool = Field(alias="has_next")

    model_config = ConfigDict(populate_by_name=True)


# ============================================================================
# PREDICTIONS
# ============================================================================


class RiskFactor(BaseModel):
    """Individual risk factor contributing to delay prediction."""

    feature: str
    contribution: float
    direction: str  # "increases_risk" or "decreases_risk"
    humanReadable: str = Field(alias="human_readable")

    model_config = ConfigDict(populate_by_name=True)


class PredictionResponse(BaseModel):
    """Delay prediction response."""

    orderId: str = Field(alias="order_id")
    riskScore: float = Field(alias="risk_score")
    isHighRisk: bool = Field(alias="is_high_risk")
    confidence: float
    topRiskFactors: List[RiskFactor] = Field(alias="top_risk_factors")
    predictedDelayMinutes: float = Field(alias="predicted_delay_minutes")
    currentEta: datetime = Field(alias="current_eta")
    modelVersion: str = Field(alias="model_version")
    predictionTimestamp: datetime = Field(alias="prediction_timestamp")

    model_config = ConfigDict(populate_by_name=True)


# ============================================================================
# ROUTES / OPTIMIZATION
# ============================================================================


class RouteResponse(BaseModel):
    """Current route for an order."""

    orderId: str = Field(alias="order_id")
    waypoints: List[Waypoint]
    totalDistanceKm: float = Field(alias="total_distance_km")
    totalDurationMinutes: float = Field(alias="total_duration_minutes")
    currentWaypointSequence: int = Field(alias="current_waypoint_sequence")
    routeOptimizedAt: datetime = Field(alias="route_optimized_at")
    solverStatus: str = Field(alias="solver_status")  # "optimal", "feasible", etc.

    model_config = ConfigDict(populate_by_name=True)


class JobStatusEnum(str, Enum):
    """Job statuses."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class JobStatusResponse(BaseModel):
    """Optimization job status."""

    jobId: str = Field(alias="job_id")
    orderId: str = Field(alias="order_id")
    status: JobStatusEnum
    submittedAt: datetime = Field(alias="submitted_at")
    startedAt: Optional[datetime] = Field(default=None, alias="started_at")
    completedAt: Optional[datetime] = Field(default=None, alias="completed_at")
    result: Optional[RouteResponse] = None
    error: Optional[str] = None
    durationMs: Optional[int] = Field(default=None, alias="duration_ms")

    model_config = ConfigDict(populate_by_name=True)


class OptimizeRouteRequest(BaseModel):
    """Request to optimize a route."""

    orderId: str = Field(alias="order_id")
    forceReroute: bool = Field(default=False, alias="force_reroute")

    model_config = ConfigDict(populate_by_name=True)


class OptimizeRouteResponse(BaseModel):
    """Response to route optimization request."""

    jobId: str = Field(alias="job_id")
    status: str
    pollUrl: str = Field(alias="poll_url")

    model_config = ConfigDict(populate_by_name=True)


# ============================================================================
# AGENT
# ============================================================================


class AgentDecisionResponse(BaseModel):
    """Agent decision for an order."""

    decisionId: str = Field(alias="decision_id")
    orderId: str = Field(alias="order_id")
    decisionType: DecisionType = Field(alias="decision_type")
    reasoning: str
    riskScore: float = Field(alias="risk_score")
    topRiskFactors: List[RiskFactor] = Field(alias="top_risk_factors")
    toolsInvoked: List[str] = Field(alias="tools_invoked")
    outcome: str  # "success", "partial", "failed"
    timestamp: datetime
    latencyMs: int = Field(alias="latency_ms")

    model_config = ConfigDict(populate_by_name=True)


class AgentDecisionHistoryResponse(BaseModel):
    """History of agent decisions for an order."""

    orderId: str = Field(alias="order_id")
    decisions: List[AgentDecisionResponse]
    latestDecision: Optional[AgentDecisionResponse] = Field(
        default=None, alias="latest_decision"
    )

    model_config = ConfigDict(populate_by_name=True)


# ============================================================================
# DRIVERS
# ============================================================================


class DriverResponse(BaseModel):
    """Driver information."""

    driverId: str = Field(alias="driver_id")
    tenantId: str = Field(alias="tenant_id")
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    isActive: bool = Field(alias="is_active")
    currentLatitude: Optional[float] = Field(default=None, alias="current_latitude")
    currentLongitude: Optional[float] = Field(default=None, alias="current_longitude")
    activeOrderCount: int = Field(alias="active_order_count")

    model_config = ConfigDict(populate_by_name=True)


class DriverStatsResponse(BaseModel):
    """Driver statistics and performance summary."""

    driverId: str = Field(alias="driver_id")
    tenantId: str = Field(alias="tenant_id")
    activeOrderCount: int = Field(alias="active_order_count")
    completedOrdersToday: int = Field(alias="completed_orders_today")
    totalDeliveries: int = Field(alias="total_deliveries")
    onTimeRate: float = Field(alias="on_time_rate")
    avgRiskScore: float = Field(alias="avg_risk_score")
    riskLevel: RiskLevel = Field(alias="risk_level")

    model_config = ConfigDict(populate_by_name=True)


class DriverRiskSummaryResponse(BaseModel):
    """Driver risk distribution summary."""

    totalDrivers: int = Field(alias="total_drivers")
    highRiskDrivers: int = Field(alias="high_risk_drivers")
    mediumRiskDrivers: int = Field(alias="medium_risk_drivers")
    lowRiskDrivers: int = Field(alias="low_risk_drivers")
    topDrivers: List[dict] = Field(alias="top_drivers")

    model_config = ConfigDict(populate_by_name=True)


class CopilotQueryRequest(BaseModel):
    """Operations copilot query payload."""

    query: str
    context: dict[str, Any] = Field(default_factory=dict)


class CopilotQueryResponse(BaseModel):
    """Structured copilot response."""

    summary: str
    evidence: List[str]
    recommendations: List[str]
    confidence: float
    sources: List[str]
    intent: str
    relatedOrderIds: List[str] = Field(default_factory=list, alias="related_order_ids")
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(populate_by_name=True)


# ============================================================================
# HEALTH
# ============================================================================


class ServiceStatus(str, Enum):
    """Service status."""

    OK = "ok"
    DEGRADED = "degraded"
    DOWN = "down"


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    api: ServiceStatus
    database: ServiceStatus
    redis: ServiceStatus
    model: ServiceStatus
    version: str
    uptimeSeconds: int = Field(alias="uptime_seconds")
    timestamp: datetime


# ============================================================================
# ERROR RESPONSES
# ============================================================================


class ErrorResponse(BaseModel):
    """Standard error response."""

    error: str
    code: str
    message: str
    requestId: Optional[str] = Field(default=None, alias="request_id")

    model_config = ConfigDict(populate_by_name=True)


class ValidationErrorResponse(BaseModel):
    """Validation error response."""

    error: str = "validation_error"
    code: str = "VALIDATION_FAILED"
    message: str
    details: List[dict]
    requestId: Optional[str] = Field(default=None, alias="request_id")

    model_config = ConfigDict(populate_by_name=True)
