"""Add continuous learning tables for drift detection and model management.

Revision ID: 1a2b3c4d5e6f7g8h
Revises: 
Create Date: 2026-03-19 04:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1a2b3c4d5e6f7g8h'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Upgrade database schema for continuous learning pipeline."""
    
    # Extend delivery_feedback table with continuous learning fields
    op.add_column('delivery_feedback', sa.Column('driver_id', sa.String(), nullable=True))
    op.add_column('delivery_feedback', sa.Column('error_min', sa.Float(), nullable=True))
    op.add_column('delivery_feedback', sa.Column('traffic_condition', sa.String(), nullable=True))
    op.add_column('delivery_feedback', sa.Column('weather', sa.String(), nullable=True))
    op.add_column('delivery_feedback', sa.Column('vehicle_type', sa.String(), nullable=True))
    op.add_column('delivery_feedback', sa.Column('distance_km', sa.Float(), nullable=True))
    op.add_column('delivery_feedback', sa.Column('time_of_day', sa.String(), nullable=True))
    op.add_column('delivery_feedback', sa.Column('day_of_week', sa.Integer(), nullable=True))
    op.add_column('delivery_feedback', sa.Column('delivered_at', sa.DateTime(), nullable=True))
    op.add_column('delivery_feedback', sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()))
    
    # Create drift_events table
    op.create_table(
        'drift_events',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('tenant_id', sa.String(), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('feature_name', sa.String(), nullable=False),
        sa.Column('ks_statistic', sa.Float(), nullable=False),
        sa.Column('p_value', sa.Float(), nullable=False),
        sa.Column('severity', sa.String(), nullable=False),
        sa.Column('training_mean', sa.Float(), nullable=True),
        sa.Column('recent_mean', sa.Float(), nullable=True),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_drift_events_tenant_id', 'drift_events', ['tenant_id'])
    op.create_index('ix_drift_events_created_at', 'drift_events', ['created_at'])
    
    # Create model_registry table
    op.create_table(
        'model_registry',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('tenant_id', sa.String(), nullable=False),
        sa.Column('model_version', sa.String(), nullable=False),
        sa.Column('stage', sa.String(), nullable=False),
        sa.Column('mae_test', sa.Float(), nullable=False),
        sa.Column('mae_improvement_pct', sa.Float(), nullable=True),
        sa.Column('rmse_test', sa.Float(), nullable=True),
        sa.Column('r2_score', sa.Float(), nullable=True),
        sa.Column('mlflow_run_id', sa.String(), nullable=True),
        sa.Column('training_start_time', sa.DateTime(), nullable=True),
        sa.Column('training_end_time', sa.DateTime(), nullable=True),
        sa.Column('deployment_time', sa.DateTime(), nullable=True),
        sa.Column('is_production', sa.Boolean(), nullable=False, default=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_model_registry_tenant_id', 'model_registry', ['tenant_id'])
    op.create_index('ix_model_registry_model_version', 'model_registry', ['model_version'])
    op.create_index('ix_model_registry_is_production', 'model_registry', ['is_production'])
    op.create_index('ix_model_registry_created_at', 'model_registry', ['created_at'])
    
    # Create model_training_logs table
    op.create_table(
        'model_training_logs',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('tenant_id', sa.String(), nullable=False),
        sa.Column('run_id', sa.String(), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('model_version', sa.String(), nullable=True),
        sa.Column('num_training_samples', sa.Integer(), nullable=True),
        sa.Column('data_quality_score', sa.Float(), nullable=True),
        sa.Column('failure_reason', sa.String(), nullable=True),
        sa.Column('error_log', sa.String(), nullable=True),
        sa.Column('mae_test', sa.Float(), nullable=True),
        sa.Column('rmse_test', sa.Float(), nullable=True),
        sa.Column('r2_score', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_model_training_logs_tenant_id', 'model_training_logs', ['tenant_id'])
    op.create_index('ix_model_training_logs_created_at', 'model_training_logs', ['created_at'])


def downgrade() -> None:
    """Downgrade database schema."""
    
    # Drop new tables
    op.drop_index('ix_model_training_logs_created_at', 'model_training_logs')
    op.drop_index('ix_model_training_logs_tenant_id', 'model_training_logs')
    op.drop_table('model_training_logs')
    
    op.drop_index('ix_model_registry_created_at', 'model_registry')
    op.drop_index('ix_model_registry_is_production', 'model_registry')
    op.drop_index('ix_model_registry_model_version', 'model_registry')
    op.drop_index('ix_model_registry_tenant_id', 'model_registry')
    op.drop_table('model_registry')
    
    op.drop_index('ix_drift_events_created_at', 'drift_events')
    op.drop_index('ix_drift_events_tenant_id', 'drift_events')
    op.drop_table('drift_events')
    
    # Remove columns from delivery_feedback
    op.drop_column('delivery_feedback', 'created_at')
    op.drop_column('delivery_feedback', 'delivered_at')
    op.drop_column('delivery_feedback', 'day_of_week')
    op.drop_column('delivery_feedback', 'time_of_day')
    op.drop_column('delivery_feedback', 'distance_km')
    op.drop_column('delivery_feedback', 'vehicle_type')
    op.drop_column('delivery_feedback', 'weather')
    op.drop_column('delivery_feedback', 'traffic_condition')
    op.drop_column('delivery_feedback', 'error_min')
    op.drop_column('delivery_feedback', 'driver_id')
