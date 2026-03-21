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
    vehicle_type = Column(String, default="bike")  # bike, auto, car
    vehicle_capacity = Column(Integer, default=10)
    zone_expertise = Column(JSON, nullable=True)  # List of zones where driver has high familiarity
    
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
    matrix_type = Column(String, default="static_fallback")
    matrix_source = Column(String, nullable=True)  # ml_predicted | static_fallback
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


class ABTest(Base):
    """A/B test registry for staged-vs-production model evaluation."""

    __tablename__ = "ab_tests"

    id = Column(String, primary_key=True, default=generate_uuid)
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False, index=True)
    model_a_version = Column(String, nullable=False)
    model_b_version = Column(String, nullable=False)
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    ends_at = Column(DateTime, nullable=False)
    status = Column(String, nullable=False, default="running")
    winner = Column(String, nullable=True)


class DeliveryFeedback(Base):
    """Per-inference feedback row used by continuous learning pipeline."""

    __tablename__ = "delivery_feedback"

    id = Column(String, primary_key=True, default=generate_uuid)
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False, index=True)
    order_id = Column(String, nullable=False, index=True)
    driver_id = Column(String, ForeignKey("drivers.id"), nullable=True)
    prediction_model_version = Column(String, nullable=False, index=True)
    predicted_eta_min = Column(Float, nullable=False)
    actual_delivery_min = Column(Float, nullable=True)
    error_min = Column(Float, nullable=True)  # actual - predicted (positive = late)
    traffic_condition = Column(String, nullable=True)  # free_flow, moderate, congested, heavy
    weather = Column(String, nullable=True)  # clear, rain, snow, fog
    vehicle_type = Column(String, nullable=True)  # car, van, truck
    distance_km = Column(Float, nullable=True)
    time_of_day = Column(String, nullable=True)  # morning, afternoon, evening, night
    day_of_week = Column(Integer, nullable=True)  # 0=Monday, 6=Sunday
    predicted_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    delivered_at = Column(DateTime, nullable=True)
    explanation_json = Column(String, nullable=True)  # JSON with SHAP explanation for prediction
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class APIKey(Base):
    """Hashed machine-to-machine API credentials per tenant."""

    __tablename__ = "api_keys"

    id = Column(String, primary_key=True, default=generate_uuid)
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False, index=True)
    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    key_prefix = Column(String, nullable=False, index=True)
    key_hash = Column(String, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_used_at = Column(DateTime, nullable=True)


class DriftEvent(Base):
    """Data drift detection event for continuous learning monitoring."""

    __tablename__ = "drift_events"

    id = Column(String, primary_key=True, default=generate_uuid)
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False, index=True)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow)
    feature_name = Column(String, nullable=False)  # distance_km, time_of_day, traffic_condition
    ks_statistic = Column(Float, nullable=False)  # KS test D statistic
    p_value = Column(Float, nullable=False)  # p-value from KS test
    severity = Column(String, nullable=False)  # low/medium/high
    training_mean = Column(Float, nullable=True)
    recent_mean = Column(Float, nullable=True)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)


class ModelRegistry(Base):
    """Model version registry for production deployment and A/B testing."""

    __tablename__ = "model_registry"

    id = Column(String, primary_key=True, default=generate_uuid)
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False, index=True)
    model_version = Column(String, nullable=False, index=True)  # v_20260319_120000
    stage = Column(String, nullable=False)  # staging, production, archived
    mae_test = Column(Float, nullable=False)
    mae_improvement_pct = Column(Float, nullable=True)  # % improvement vs previous
    rmse_test = Column(Float, nullable=True)
    r2_score = Column(Float, nullable=True)
    mlflow_run_id = Column(String, nullable=True)
    training_start_time = Column(DateTime, nullable=True)
    training_end_time = Column(DateTime, nullable=True)
    deployment_time = Column(DateTime, nullable=True)
    is_production = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)


class ModelTrainingLog(Base):
    """Log of retraining runs for audit and debugging."""

    __tablename__ = "model_training_logs"

    id = Column(String, primary_key=True, default=generate_uuid)
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False, index=True)
    run_id = Column(String, nullable=False)  # Celery task ID or MLflow run ID
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    status = Column(String, nullable=False)  # running, success, failed, skipped
    model_version = Column(String, nullable=True)
    num_training_samples = Column(Integer, nullable=True)
    data_quality_score = Column(Float, nullable=True)
    failure_reason = Column(String, nullable=True)  # reason if status=failed
    error_log = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)


class TrafficPattern(Base):
    """Historical traffic patterns aggregated by zone, time, and day."""

    __tablename__ = "traffic_patterns"

    id = Column(String, primary_key=True, default=generate_uuid)
    zone_origin = Column(String, nullable=False, index=True)  # "lat_lng" zone ID
    zone_dest = Column(String, nullable=False, index=True)
    weekday = Column(Integer, nullable=False)  # 0=Monday, 6=Sunday
    hour = Column(Integer, nullable=False)  # Hour of day 0-23
    avg_travel_time_min = Column(Float, nullable=False)
    std_travel_time_min = Column(Float, nullable=True)
    avg_traffic_ratio = Column(Float, nullable=False)  # 1.0 = no traffic, 2.0 = double time
    std_traffic_ratio = Column(Float, nullable=True)  # Traffic variability
    avg_distance_meters = Column(Float, nullable=True)
    sample_count = Column(Integer, nullable=False)  # Number of samples in aggregate
    last_updated = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
