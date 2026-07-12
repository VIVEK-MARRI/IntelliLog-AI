"""Initial schema for IntelliLog-AI.

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00.000000

Schema note: All ID and tenant_id columns use TEXT (String) rather than
postgresql.UUID so that:
  - Dev mode works with the string slug "dev-tenant-id" without casts.
  - Human-readable demo order IDs like "DEMO-normal-001" work as-is.
  - SQLite (used in lightweight tests) works without dialect branches.
  - The system can be migrated to UUID PK later as a separate step
    without breaking existing data or dev flows.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# Revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create initial schema."""

    # Create tenants table
    op.create_table(
        'tenants',
        sa.Column('id', sa.String(64), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('api_key_hash', sa.String(64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default=sa.true(), nullable=True),
        sa.CheckConstraint('LENGTH(name) > 0'),
        sa.CheckConstraint('LENGTH(api_key_hash) = 64'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('api_key_hash'),
    )
    op.create_index('idx_tenants_active', 'tenants', ['is_active'])

    # Create drivers table
    op.create_table(
        'drivers',
        sa.Column('id', sa.String(64), nullable=False),
        sa.Column('tenant_id', sa.String(64), nullable=False),
        sa.Column('name', sa.String(255), nullable=True),
        sa.Column('historical_on_time_rate', sa.Float(),
                  server_default='0.85', nullable=True),
        sa.Column('total_deliveries', sa.Integer(),
                  server_default='0', nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=True),
        sa.CheckConstraint('historical_on_time_rate >= 0.0 AND historical_on_time_rate <= 1.0'),
        sa.CheckConstraint('total_deliveries >= 0'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', 'tenant_id'),
    )
    op.create_index('idx_drivers_tenant', 'drivers', ['tenant_id'])

    # Create orders table
    op.create_table(
        'orders',
        sa.Column('id', sa.String(64), nullable=False),
        sa.Column('tenant_id', sa.String(64), nullable=False),
        sa.Column('driver_id', sa.String(64), nullable=True),
        sa.Column('status', sa.String(50), server_default='pending', nullable=True),
        sa.Column('planned_stops', sa.Integer(), nullable=False),
        sa.Column('completed_stops', sa.Integer(), server_default='0', nullable=True),
        sa.Column('planned_eta', sa.DateTime(timezone=True), nullable=False),
        sa.Column('actual_eta', sa.DateTime(timezone=True), nullable=True),
        sa.Column('current_risk_score', sa.Float(), server_default='0.0', nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=True),
        sa.CheckConstraint("status IN ('pending','assigned','in_progress','completed','failed')"),
        sa.CheckConstraint('planned_stops > 0'),
        sa.CheckConstraint('completed_stops >= 0'),
        sa.CheckConstraint('current_risk_score >= 0.0 AND current_risk_score <= 1.0'),
        sa.CheckConstraint('completed_stops <= planned_stops'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', 'tenant_id'),
    )
    op.create_index('idx_orders_tenant_status', 'orders', ['tenant_id', 'status'])
    op.create_index('idx_orders_driver', 'orders', ['driver_id'])
    op.create_index('idx_orders_eta', 'orders', ['planned_eta'])

    # Create gps_events table
    op.create_table(
        'gps_events',
        sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column('tenant_id', sa.String(64), nullable=False),
        sa.Column('order_id', sa.String(64), nullable=False),
        sa.Column('driver_id', sa.String(64), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('speed_kmh', sa.Float(), server_default='0', nullable=True),
        sa.Column('heading_degrees', sa.Float(), nullable=True),
        sa.Column('event_type', sa.String(30), server_default='ping', nullable=True),
        sa.Column('recorded_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('sequence_number', sa.Integer(), nullable=True),
        sa.CheckConstraint('speed_kmh >= 0'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_gps_order_time', 'gps_events', ['order_id', 'recorded_at'])
    op.create_index('idx_gps_tenant_time', 'gps_events', ['tenant_id', 'recorded_at'])
    op.create_index('idx_gps_event_type', 'gps_events', ['event_type'])
    op.create_index('idx_gps_recorded_at', 'gps_events', ['recorded_at'])

    # Create agent_decisions table
    op.create_table(
        'agent_decisions',
        sa.Column('id', sa.String(64), nullable=False),
        sa.Column('order_id', sa.String(64), nullable=False),
        sa.Column('tenant_id', sa.String(64), nullable=False),
        sa.Column('decided_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=True),
        sa.Column('risk_score', sa.Float(), nullable=False),
        sa.Column('decision', sa.String(50), nullable=False),
        sa.Column('reasoning', sa.Text(), server_default='{}', nullable=False),
        sa.Column('tools_called', sa.Text(), server_default='[]', nullable=True),
        sa.Column('outcome', sa.String(50), nullable=True),
        sa.Column('model_version', sa.String(50), nullable=True),
        sa.CheckConstraint('risk_score >= 0 AND risk_score <= 1'),
        sa.CheckConstraint(
            "decision IN ('no_action','alert_customer','reroute','escalate','alert','monitor','notify')"
        ),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_agent_order_time', 'agent_decisions', ['order_id', 'decided_at'])
    op.create_index('idx_agent_tenant_time', 'agent_decisions', ['tenant_id', 'decided_at'])
    op.create_index('idx_agent_risk', 'agent_decisions', ['risk_score'])

    # Create route_plans table
    op.create_table(
        'route_plans',
        sa.Column('id', sa.String(64), nullable=False),
        sa.Column('order_id', sa.String(64), nullable=False),
        sa.Column('tenant_id', sa.String(64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=True),
        sa.Column('waypoints', sa.Text(), server_default='[]', nullable=False),
        sa.Column('total_distance_km', sa.Float(), nullable=True),
        sa.Column('total_duration_minutes', sa.Float(), nullable=True),
        sa.Column('solver_status', sa.String(30), nullable=True),
        sa.Column('solver_duration_ms', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', 'tenant_id'),
    )
    op.create_index('idx_route_plans_order', 'route_plans', ['order_id'])
    op.create_index('idx_route_plans_created', 'route_plans', ['created_at'])

    # Create predictions table
    op.create_table(
        'predictions',
        sa.Column('id', sa.String(64), nullable=False),
        sa.Column('order_id', sa.String(64), nullable=False),
        sa.Column('tenant_id', sa.String(64), nullable=False),
        sa.Column('risk_score', sa.Float(), nullable=False),
        sa.Column('is_high_risk', sa.Boolean(), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=False),
        sa.Column('top_risk_factors', sa.Text(), server_default='[]', nullable=False),
        sa.Column('predicted_delay_minutes', sa.Float(), nullable=False),
        sa.Column('model_version', sa.String(50), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=True),
        sa.CheckConstraint('risk_score >= 0 AND risk_score <= 1'),
        sa.CheckConstraint('confidence >= 0 AND confidence <= 1'),
        sa.CheckConstraint('predicted_delay_minutes >= 0'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_predictions_order_time', 'predictions', ['order_id', 'created_at'])
    op.create_index('idx_predictions_tenant_time', 'predictions', ['tenant_id', 'created_at'])
    op.create_index('idx_predictions_risk', 'predictions', ['risk_score'])

    # Create trigger function for updated_at
    op.execute("""
        CREATE OR REPLACE FUNCTION update_order_updated_at()
        RETURNS TRIGGER AS $trigger$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $trigger$ LANGUAGE plpgsql
    """)

    op.execute("""
        CREATE TRIGGER trigger_order_updated_at
        BEFORE UPDATE ON orders
        FOR EACH ROW
        EXECUTE FUNCTION update_order_updated_at()
    """)

    # Backward-compatible view for older code paths.
    op.execute('CREATE VIEW gps_pings AS SELECT * FROM gps_events')


def downgrade() -> None:
    """Drop initial schema."""

    # Drop triggers
    op.execute('DROP TRIGGER IF EXISTS trigger_order_updated_at ON orders')
    op.execute('DROP FUNCTION IF EXISTS update_order_updated_at()')

    # Drop tables
    op.execute('DROP VIEW IF EXISTS gps_pings')
    op.drop_table('predictions')
    op.drop_table('route_plans')
    op.drop_table('agent_decisions')
    op.drop_table('gps_events')
    op.drop_table('orders')
    op.drop_table('drivers')
    op.drop_table('tenants')
