-- TimescaleDB Schema for IntelliLog-AI
-- Production-grade logistics delay-prevention platform

-- Create extensions required by the schema on plain PostgreSQL.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- TENANTS TABLE - Multi-tenant support
-- ============================================================================
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    api_key_hash VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    CONSTRAINT valid_name CHECK (LENGTH(name) > 0),
    CONSTRAINT valid_api_key CHECK (LENGTH(api_key_hash) = 64)
);

CREATE INDEX idx_tenants_active ON tenants(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- DRIVERS TABLE - Driver profiles and performance metrics
-- ============================================================================
CREATE TABLE drivers (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255),
    historical_on_time_rate FLOAT DEFAULT 0.85 
        CHECK (historical_on_time_rate >= 0.0 AND historical_on_time_rate <= 1.0),
    total_deliveries INTEGER DEFAULT 0 CHECK (total_deliveries >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, id),
    CONSTRAINT valid_name CHECK (LENGTH(name) > 0 OR name IS NULL)
);

CREATE INDEX idx_drivers_tenant ON drivers(tenant_id);

-- ============================================================================
-- ORDERS TABLE - Delivery orders and status tracking
-- ============================================================================
CREATE TABLE orders (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'pending' 
        CHECK (status IN ('pending','assigned','in_progress','completed','failed')),
    planned_stops INTEGER NOT NULL CHECK (planned_stops > 0),
    completed_stops INTEGER DEFAULT 0 CHECK (completed_stops >= 0),
    planned_eta TIMESTAMPTZ NOT NULL,
    actual_eta TIMESTAMPTZ,
    current_risk_score FLOAT DEFAULT 0.0 
        CHECK (current_risk_score >= 0.0 AND current_risk_score <= 1.0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, id),
    CONSTRAINT valid_stops CHECK (completed_stops <= planned_stops),
    CONSTRAINT valid_eta CHECK (actual_eta IS NULL OR actual_eta >= created_at)
);

CREATE INDEX idx_orders_tenant_status ON orders(tenant_id, status) WHERE status != 'completed';
CREATE INDEX idx_orders_driver ON orders(driver_id);
CREATE INDEX idx_orders_eta ON orders(planned_eta);

-- ============================================================================
-- GPS_EVENTS TABLE - Time-series GPS data
-- ============================================================================
CREATE TABLE gps_events (
    id BIGSERIAL,
    tenant_id UUID NOT NULL,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL,
    speed_kmh FLOAT DEFAULT 0 CHECK (speed_kmh >= 0),
    heading_degrees FLOAT CHECK (heading_degrees >= 0 AND heading_degrees < 360),
    event_type VARCHAR(30) DEFAULT 'ping',
    recorded_at TIMESTAMPTZ NOT NULL,
    sequence_number INTEGER,
    PRIMARY KEY (id, recorded_at)
);

-- Indexes for common queries
CREATE INDEX idx_gps_order_time ON gps_events(order_id, recorded_at DESC);
CREATE INDEX idx_gps_tenant_time ON gps_events(tenant_id, recorded_at DESC);
CREATE INDEX idx_gps_event_type ON gps_events(event_type);
CREATE INDEX idx_gps_recorded_at ON gps_events(recorded_at DESC);

-- Continuous aggregate: hourly GPS summary per order
-- CREATE MATERIALIZED VIEW gps_events_hourly AS
-- SELECT 
--     time_bucket('1 hour', recorded_at) AS hour,
--     order_id,
--     tenant_id,
--     COUNT(*) AS ping_count,
--     AVG(latitude) AS avg_latitude,
--     AVG(longitude) AS avg_longitude,
--     AVG(speed_kmh) AS avg_speed,
--     MAX(speed_kmh) AS max_speed,
--     MIN(speed_kmh) AS min_speed
-- FROM gps_events
-- GROUP BY hour, order_id, tenant_id
-- WITH DATA;

-- Backward-compatible view for code paths that still reference gps_pings.
CREATE VIEW gps_pings AS
SELECT * FROM gps_events;

-- ============================================================================
-- AGENT_DECISIONS TABLE - Audit trail of all agent decisions
-- ============================================================================
CREATE TABLE agent_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    decided_at TIMESTAMPTZ DEFAULT NOW(),
    risk_score FLOAT NOT NULL CHECK (risk_score >= 0 AND risk_score <= 1),
    decision VARCHAR(50) NOT NULL 
        CHECK (decision IN ('no_action','alert_customer','reroute','escalate')),
    reasoning JSONB NOT NULL,
    tools_called JSONB DEFAULT '[]'::jsonb,
    outcome VARCHAR(50) CHECK (outcome IN ('delivered_on_time', 'still_late', 'prevented', 'unknown', NULL)),
    model_version VARCHAR(50),
    UNIQUE(tenant_id, id)
);

CREATE INDEX idx_agent_order_time ON agent_decisions(order_id, decided_at DESC);
CREATE INDEX idx_agent_tenant_time ON agent_decisions(tenant_id, decided_at DESC);
CREATE INDEX idx_agent_risk ON agent_decisions(risk_score DESC);

-- ============================================================================
-- ROUTE_PLANS TABLE - Optimization results and waypoints
-- ============================================================================
CREATE TABLE route_plans (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    waypoints JSONB NOT NULL,
    total_distance_km FLOAT CHECK (total_distance_km > 0),
    total_duration_minutes FLOAT CHECK (total_duration_minutes > 0),
    solver_status VARCHAR(30),
    solver_duration_ms INTEGER CHECK (solver_duration_ms >= 0),
    UNIQUE(tenant_id, id)
);

CREATE INDEX idx_route_plans_order ON route_plans(order_id);
CREATE INDEX idx_route_plans_created ON route_plans(created_at DESC);

-- ============================================================================
-- PREDICTIONS TABLE - Cached and persisted model outputs
-- ============================================================================
CREATE TABLE predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    risk_score FLOAT NOT NULL CHECK (risk_score >= 0 AND risk_score <= 1),
    is_high_risk BOOLEAN NOT NULL,
    confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    top_risk_factors JSONB NOT NULL,
    predicted_delay_minutes FLOAT NOT NULL CHECK (predicted_delay_minutes >= 0),
    model_version VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, id)
);

CREATE INDEX idx_predictions_order_time ON predictions(order_id, created_at DESC);
CREATE INDEX idx_predictions_tenant_time ON predictions(tenant_id, created_at DESC);
CREATE INDEX idx_predictions_risk ON predictions(risk_score DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) - Multi-tenant isolation
-- ============================================================================

ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;

-- Policy: tenants can only see their own drivers
CREATE POLICY drivers_tenant_isolation ON drivers
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Policy: tenants can only see their own orders
CREATE POLICY orders_tenant_isolation ON orders
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Policy: tenants can only see their own GPS pings
CREATE POLICY gps_events_tenant_isolation ON gps_events
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Policy: tenants can only see their own agent decisions
CREATE POLICY agent_decisions_tenant_isolation ON agent_decisions
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Policy: tenants can only see their own route plans
CREATE POLICY route_plans_tenant_isolation ON route_plans
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY predictions_tenant_isolation ON predictions
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- ============================================================================
-- FUNCTIONS - Utility functions for timestamps and data management
-- ============================================================================

-- Auto-update updated_at timestamp on orders
CREATE OR REPLACE FUNCTION update_order_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_order_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION update_order_updated_at();

-- ============================================================================
-- COMMENTS - Documentation for developers
-- ============================================================================

COMMENT ON TABLE tenants IS 'Multi-tenant organization accounts';
COMMENT ON TABLE drivers IS 'Driver profiles with performance metrics';
COMMENT ON TABLE orders IS 'Delivery orders and their status';
COMMENT ON TABLE gps_events IS 'Real-time GPS events';
COMMENT ON TABLE agent_decisions IS 'Audit trail of all AI agent decisions and interventions';
COMMENT ON TABLE route_plans IS 'Route optimization results and waypoints';
COMMENT ON TABLE predictions IS 'Persisted ML predictions and explanations';

COMMENT ON COLUMN orders.current_risk_score IS 'Latest ML model risk prediction (0.0-1.0)';
COMMENT ON COLUMN gps_events.recorded_at IS 'Recorded time of the GPS event';
COMMENT ON COLUMN agent_decisions.reasoning IS 'SHAP values and feature contributions explaining the decision';
