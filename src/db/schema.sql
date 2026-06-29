-- ============================================================================
-- IntelliLog-AI Database Schema
-- TimescaleDB + PostgreSQL for production logistics platform
-- ============================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "timescaledb" CASCADE;

-- ============================================================================
-- TENANT MANAGEMENT
-- ============================================================================

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    api_key_hash VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    
    CONSTRAINT api_key_hash_not_empty CHECK (length(api_key_hash) > 0)
);

CREATE INDEX idx_tenants_is_active ON tenants(is_active);
CREATE INDEX idx_tenants_created_at ON tenants(created_at);

-- ============================================================================
-- DRIVERS
-- ============================================================================

CREATE TABLE drivers (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255),
    historical_on_time_rate FLOAT DEFAULT 0.85,
    total_deliveries INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_on_time_rate CHECK (
        historical_on_time_rate >= 0.0 AND historical_on_time_rate <= 1.0
    ),
    CONSTRAINT positive_deliveries CHECK (total_deliveries >= 0)
);

CREATE INDEX idx_drivers_tenant_id ON drivers(tenant_id);
CREATE INDEX idx_drivers_created_at ON drivers(created_at);
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY drivers_tenant_isolation ON drivers
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- ============================================================================
-- ORDERS
-- ============================================================================

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'pending',
    planned_stops INTEGER NOT NULL,
    completed_stops INTEGER DEFAULT 0,
    planned_eta TIMESTAMPTZ NOT NULL,
    actual_eta TIMESTAMPTZ,
    current_risk_score FLOAT DEFAULT 0.0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_status CHECK (
        status IN ('pending','assigned','in_progress','completed','failed')
    ),
    CONSTRAINT positive_stops CHECK (planned_stops > 0 AND completed_stops >= 0),
    CONSTRAINT completed_not_over_planned CHECK (completed_stops <= planned_stops),
    CONSTRAINT valid_risk_score CHECK (
        current_risk_score >= 0.0 AND current_risk_score <= 1.0
    )
);

CREATE INDEX idx_orders_tenant_id ON orders(tenant_id);
CREATE INDEX idx_orders_driver_id ON orders(driver_id);
CREATE INDEX idx_orders_tenant_status ON orders(tenant_id, status) 
    WHERE status != 'completed';
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_updated_at ON orders(updated_at);
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_tenant_isolation ON orders
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- ============================================================================
-- GPS PINGS (TimescaleDB Hypertable)
-- ============================================================================

CREATE TABLE gps_pings (
    id BIGSERIAL,
    tenant_id UUID NOT NULL,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL,
    speed_kmh FLOAT DEFAULT 0,
    heading_degrees FLOAT,
    event_type VARCHAR(30) DEFAULT 'ping',
    recorded_at TIMESTAMPTZ NOT NULL,
    sequence_number INTEGER,
    PRIMARY KEY (id, recorded_at)
);

-- Convert to TimescaleDB hypertable
SELECT create_hypertable('gps_pings', 'recorded_at', 
    if_not_exists => TRUE);

-- Set chunk interval to 1 day for better performance
SELECT set_chunk_time_interval('gps_pings', INTERVAL '1 day');

-- Indexes for common queries
CREATE INDEX idx_gps_pings_order_recorded ON gps_pings(order_id, recorded_at DESC);
CREATE INDEX idx_gps_pings_tenant_recorded ON gps_pings(tenant_id, recorded_at DESC);
CREATE INDEX idx_gps_pings_driver_recorded ON gps_pings(driver_id, recorded_at DESC);
CREATE INDEX idx_gps_pings_event_type ON gps_pings(event_type);

ALTER TABLE gps_pings ENABLE ROW LEVEL SECURITY;

CREATE POLICY gps_pings_tenant_isolation ON gps_pings
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- Continuous aggregate for hourly GPS summary per order
CREATE MATERIALIZED VIEW gps_hourly_summary WITH (timescaledb.continuous) AS
    SELECT
        time_bucket('1 hour', recorded_at) AS hour,
        order_id,
        tenant_id,
        driver_id,
        AVG(latitude) AS avg_latitude,
        AVG(longitude) AS avg_longitude,
        AVG(speed_kmh) AS avg_speed_kmh,
        MAX(speed_kmh) AS max_speed_kmh,
        COUNT(*) AS ping_count
    FROM gps_pings
    GROUP BY hour, order_id, tenant_id, driver_id
WITH NO DATA;

-- Refresh policy for continuous aggregate (every 5 minutes)
SELECT add_continuous_aggregate_policy('gps_hourly_summary',
    start_offset => INTERVAL '2 hours',
    end_offset => INTERVAL '5 minutes',
    schedule_interval => INTERVAL '5 minutes',
    if_not_exists => TRUE);

-- ============================================================================
-- AGENT DECISIONS (Full Audit Trail)
-- ============================================================================

CREATE TABLE agent_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    decided_at TIMESTAMPTZ DEFAULT NOW(),
    risk_score FLOAT NOT NULL,
    decision VARCHAR(50) NOT NULL,
    reasoning JSONB NOT NULL,
    tools_called JSONB DEFAULT '[]',
    outcome VARCHAR(50),
    model_version VARCHAR(50),
    
    CONSTRAINT valid_decision CHECK (
        decision IN ('no_action','alert_customer','reroute','escalate')
    ),
    CONSTRAINT valid_outcome CHECK (
        outcome IS NULL OR outcome IN (
            'delivered_on_time', 'still_late', 'recovered', 'escalated'
        )
    ),
    CONSTRAINT valid_risk_score CHECK (
        risk_score >= 0.0 AND risk_score <= 1.0
    )
);

CREATE INDEX idx_agent_decisions_order_id ON agent_decisions(order_id);
CREATE INDEX idx_agent_decisions_tenant_id ON agent_decisions(tenant_id);
CREATE INDEX idx_agent_decisions_decided_at ON agent_decisions(decided_at DESC);
CREATE INDEX idx_agent_decisions_order_decided ON agent_decisions(order_id, decided_at DESC);
CREATE INDEX idx_agent_decisions_outcome ON agent_decisions(outcome);
ALTER TABLE agent_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_decisions_tenant_isolation ON agent_decisions
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- ============================================================================
-- ROUTE PLANS
-- ============================================================================

CREATE TABLE route_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    waypoints JSONB NOT NULL,
    total_distance_km FLOAT,
    total_duration_minutes FLOAT,
    solver_status VARCHAR(30),
    solver_duration_ms INTEGER,
    
    CONSTRAINT valid_distance CHECK (total_distance_km IS NULL OR total_distance_km > 0),
    CONSTRAINT valid_duration CHECK (total_duration_minutes IS NULL OR total_duration_minutes > 0),
    CONSTRAINT valid_solver_status CHECK (
        solver_status IS NULL OR solver_status IN ('optimal', 'feasible', 'timeout')
    ),
    CONSTRAINT valid_solver_duration CHECK (solver_duration_ms IS NULL OR solver_duration_ms >= 0)
);

CREATE INDEX idx_route_plans_order_id ON route_plans(order_id);
CREATE INDEX idx_route_plans_tenant_id ON route_plans(tenant_id);
CREATE INDEX idx_route_plans_created_at ON route_plans(created_at);
ALTER TABLE route_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY route_plans_tenant_isolation ON route_plans
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- ============================================================================
-- TRIGGERS FOR AUDIT AND MAINTENANCE
-- ============================================================================

-- Update updated_at timestamp on orders
CREATE OR REPLACE FUNCTION update_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_orders_updated_at();

-- Update updated_at timestamp on drivers
CREATE OR REPLACE FUNCTION update_drivers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_drivers_updated_at
    BEFORE UPDATE ON drivers
    FOR EACH ROW
    EXECUTE FUNCTION update_drivers_updated_at();

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Active orders with latest GPS ping
CREATE VIEW v_orders_with_latest_ping AS
SELECT
    o.id,
    o.tenant_id,
    o.driver_id,
    o.status,
    o.planned_stops,
    o.completed_stops,
    o.planned_eta,
    o.actual_eta,
    o.current_risk_score,
    o.created_at,
    o.updated_at,
    gp.latitude,
    gp.longitude,
    gp.speed_kmh,
    gp.heading_degrees,
    gp.recorded_at AS last_ping_at
FROM orders o
LEFT JOIN LATERAL (
    SELECT latitude, longitude, speed_kmh, heading_degrees, recorded_at
    FROM gps_pings
    WHERE gps_pings.order_id = o.id
    ORDER BY recorded_at DESC
    LIMIT 1
) gp ON TRUE
WHERE o.status IN ('in_progress', 'assigned');

-- Driver performance metrics
CREATE VIEW v_driver_metrics AS
SELECT
    d.id,
    d.tenant_id,
    d.name,
    d.total_deliveries,
    d.historical_on_time_rate,
    COUNT(o.id) FILTER (WHERE o.status = 'completed') AS recent_deliveries,
    COUNT(o.id) FILTER (WHERE o.status = 'completed' AND o.actual_eta > o.planned_eta) 
        AS recent_late_count,
    CASE 
        WHEN COUNT(o.id) FILTER (WHERE o.status = 'completed') = 0 THEN 1.0
        ELSE (COUNT(o.id) FILTER (WHERE o.status = 'completed' AND o.actual_eta <= o.planned_eta)::FLOAT / 
              COUNT(o.id) FILTER (WHERE o.status = 'completed'))
    END AS recent_on_time_rate
FROM drivers d
LEFT JOIN orders o ON d.id = o.driver_id AND o.created_at >= NOW() - INTERVAL '7 days'
GROUP BY d.id, d.tenant_id, d.name, d.total_deliveries, d.historical_on_time_rate;

-- ============================================================================
-- DOCUMENTATION COMMENTS
-- ============================================================================

COMMENT ON TABLE gps_pings IS 
    'High-frequency time-series data from driver GPS devices. Stored as TimescaleDB hypertable for efficient compression and querying. Chunk interval: 1 day.';

COMMENT ON TABLE agent_decisions IS 
    'Full audit trail of every decision made by the ML agent. Includes risk scores, SHAP values, and tools invoked for explainability.';

COMMENT ON COLUMN agent_decisions.reasoning IS 
    'JSONB containing SHAP values, feature contributions, and model confidence for explainability.';

COMMENT ON COLUMN agent_decisions.tools_called IS 
    'JSONB array of tools invoked by the agent (e.g., [{"tool": "alert_customer"}, {"tool": "reroute"}])';

COMMENT ON COLUMN gps_pings.event_type IS 
    'Type of GPS event: ping (periodic), stop_arrival, stop_departure, depot_arrival';

-- ============================================================================
-- PERFORMANCE OPTIMIZATION
-- ============================================================================

-- Analyze all tables for query planning
ANALYZE;

-- Set autovacuum more aggressive for high-traffic tables
ALTER TABLE gps_pings SET (
    autovacuum_vacuum_scale_factor = 0.01,
    autovacuum_analyze_scale_factor = 0.005
);

ALTER TABLE agent_decisions SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
);
