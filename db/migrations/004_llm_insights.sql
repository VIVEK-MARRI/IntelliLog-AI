-- Migration 004: Executive Summaries and LLM Insight Storage
-- Adds tables for AI-generated operational summaries, insights, and analysis.

-- ============================================================================
-- executive_summaries: Stores AI-generated operational summaries
-- ============================================================================
CREATE TABLE IF NOT EXISTS executive_summaries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT NOT NULL,
    summary_type    TEXT NOT NULL CHECK (summary_type IN ('operational', 'risk', 'driver', 'route')),
    summary_text    TEXT NOT NULL,
    confidence      REAL NOT NULL DEFAULT 0.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
    evidence        JSONB NOT NULL DEFAULT '[]'::jsonb,
    recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata        JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Index for fast lookups per tenant + type
    CONSTRAINT idx_summaries_lookup UNIQUE (tenant_id, summary_type, created_at)
);

CREATE INDEX IF NOT EXISTS idx_executive_summaries_tenant
    ON executive_summaries (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_executive_summaries_type
    ON executive_summaries (tenant_id, summary_type, created_at DESC);

-- ============================================================================
-- agent_insights: Stores per-order LLM analysis results
-- (Separate from agent_decisions for performance -- LLM analysis is expensive
--  and only generated for high-risk events)
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_insights (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        TEXT NOT NULL,
    tenant_id       TEXT NOT NULL,
    driver_id       TEXT,
    risk_score      REAL NOT NULL,

    -- LLM-generated fields
    llm_insight            TEXT,
    llm_risk_drivers       JSONB DEFAULT '[]'::jsonb,
    llm_suggested_actions  JSONB DEFAULT '[]'::jsonb,
    llm_severity           TEXT CHECK (llm_severity IN ('high', 'medium', 'low', NULL)),
    generated_insight      TEXT,

    -- Metrics
    llm_latency_ms  REAL,
    llm_model       TEXT,
    token_count     INTEGER DEFAULT 0,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_insights_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_insights_order
    ON agent_insights (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_insights_tenant
    ON agent_insights (tenant_id, created_at DESC);

-- ============================================================================
-- copilot_conversations: Stores copilot conversations for audit/history
-- ============================================================================
CREATE TABLE IF NOT EXISTS copilot_conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT NOT NULL,
    user_query      TEXT NOT NULL,
    llm_summary     TEXT,
    llm_confidence  REAL,
    llm_evidence    JSONB DEFAULT '[]'::jsonb,
    llm_recommendations JSONB DEFAULT '[]'::jsonb,
    llm_metadata    JSONB DEFAULT '{}'::jsonb,
    llm_latency_ms  REAL,
    llm_model       TEXT,
    token_count     INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copilot_conversations_tenant
    ON copilot_conversations (tenant_id, created_at DESC);

-- ============================================================================
-- Add LLM insight fields to existing orders table
-- ============================================================================
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS llm_insight TEXT,
    ADD COLUMN IF NOT EXISTS llm_risk_drivers JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS llm_suggested_actions JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS llm_severity TEXT,
    ADD COLUMN IF NOT EXISTS generated_insight TEXT,
    ADD COLUMN IF NOT EXISTS risk_level_label TEXT;

-- ============================================================================
-- Notify function for new summaries
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_executive_summary()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify(
        'executive_summary',
        json_build_object(
            'tenant_id', NEW.tenant_id,
            'summary_type', NEW.summary_type,
            'summary_id', NEW.id::text,
            'created_at', NEW.created_at::text
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_executive_summary_notify ON executive_summaries;
CREATE TRIGGER trg_executive_summary_notify
    AFTER INSERT ON executive_summaries
    FOR EACH ROW
    EXECUTE FUNCTION notify_executive_summary();
