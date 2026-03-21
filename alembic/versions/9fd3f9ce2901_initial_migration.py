"""Initial migration

Revision ID: 9fd3f9ce2901
Revises: 
Create Date: 2026-02-04 11:31:29.621754

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '9fd3f9ce2901'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Base multi-tenant schema.
    op.create_table('tenants',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('name', sa.String(), nullable=False),
    sa.Column('slug', sa.String(), nullable=False),
    sa.Column('plan', sa.String(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_tenants_slug'), 'tenants', ['slug'], unique=True)
    
    op.create_table('warehouses',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('name', sa.String(), nullable=False),
    sa.Column('lat', sa.Float(), nullable=False),
    sa.Column('lng', sa.Float(), nullable=False),
    sa.Column('service_radius_km', sa.Float(), nullable=True, default=25.0),
    sa.Column('capacity', sa.Integer(), nullable=True, default=500),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.Column('tenant_id', sa.String(), nullable=False),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_warehouses_tenant_id'), 'warehouses', ['tenant_id'])
    
    op.create_table('drivers',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('name', sa.String(), nullable=False),
    sa.Column('phone', sa.String(), nullable=True),
    sa.Column('status', sa.String(), nullable=True, default='offline'),
    sa.Column('current_lat', sa.Float(), nullable=True),
    sa.Column('current_lng', sa.Float(), nullable=True),
    sa.Column('vehicle_type', sa.String(), nullable=True, default='bike'),
    sa.Column('vehicle_capacity', sa.Integer(), nullable=True, default=10),
    sa.Column('zone_expertise', sa.JSON(), nullable=True),
    sa.Column('tenant_id', sa.String(), nullable=False),
    sa.Column('warehouse_id', sa.String(), nullable=True),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ),
    sa.ForeignKeyConstraint(['warehouse_id'], ['warehouses.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_drivers_tenant_id'), 'drivers', ['tenant_id'])
    op.create_index(op.f('ix_drivers_warehouse_id'), 'drivers', ['warehouse_id'])
    
    op.create_table('users',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('email', sa.String(), nullable=False),
    sa.Column('hashed_password', sa.String(), nullable=False),
    sa.Column('full_name', sa.String(), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=True, default=True),
    sa.Column('is_superuser', sa.Boolean(), nullable=True, default=False),
    sa.Column('role', sa.String(), nullable=True, default='user'),
    sa.Column('tenant_id', sa.String(), nullable=False),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_tenant_id'), 'users', ['tenant_id'])
    
    op.create_table('routes',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('status', sa.String(), nullable=True, default='planned'),
    sa.Column('total_distance_km', sa.Float(), nullable=True, default=0.0),
    sa.Column('total_duration_min', sa.Float(), nullable=True, default=0.0),
    sa.Column('geometry_json', sa.JSON(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.Column('updated_at', sa.DateTime(), nullable=True),
    sa.Column('driver_id', sa.String(), nullable=True),
    sa.Column('tenant_id', sa.String(), nullable=False),
    sa.Column('warehouse_id', sa.String(), nullable=True),
    sa.ForeignKeyConstraint(['driver_id'], ['drivers.id'], ),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ),
    sa.ForeignKeyConstraint(['warehouse_id'], ['warehouses.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_routes_tenant_id'), 'routes', ['tenant_id'])
    op.create_index(op.f('ix_routes_driver_id'), 'routes', ['driver_id'])
    op.create_index(op.f('ix_routes_warehouse_id'), 'routes', ['warehouse_id'])
    op.create_index(op.f('ix_routes_status'), 'routes', ['status'])
    
    op.create_table('orders',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('order_number', sa.String(), nullable=True),
    sa.Column('customer_name', sa.String(), nullable=True),
    sa.Column('delivery_address', sa.String(), nullable=False),
    sa.Column('lat', sa.Float(), nullable=False),
    sa.Column('lng', sa.Float(), nullable=False),
    sa.Column('weight', sa.Float(), nullable=True, default=1.0),
    sa.Column('time_window_start', sa.DateTime(), nullable=True),
    sa.Column('time_window_end', sa.DateTime(), nullable=True),
    sa.Column('status', sa.String(), nullable=True, default='pending'),
    sa.Column('tenant_id', sa.String(), nullable=False),
    sa.Column('route_id', sa.String(), nullable=True),
    sa.Column('warehouse_id', sa.String(), nullable=True),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ),
    sa.ForeignKeyConstraint(['route_id'], ['routes.id'], ),
    sa.ForeignKeyConstraint(['warehouse_id'], ['warehouses.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_orders_order_number'), 'orders', ['order_number'], unique=True)
    op.create_index(op.f('ix_orders_tenant_id'), 'orders', ['tenant_id'])
    op.create_index(op.f('ix_orders_route_id'), 'orders', ['route_id'])
    op.create_index(op.f('ix_orders_warehouse_id'), 'orders', ['warehouse_id'])
    op.create_index(op.f('ix_orders_status'), 'orders', ['status'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_orders_status'), table_name='orders')
    op.drop_index(op.f('ix_orders_warehouse_id'), table_name='orders')
    op.drop_index(op.f('ix_orders_route_id'), table_name='orders')
    op.drop_index(op.f('ix_orders_tenant_id'), table_name='orders')
    op.drop_index(op.f('ix_orders_order_number'), table_name='orders')
    op.drop_table('orders')
    op.drop_index(op.f('ix_routes_status'), table_name='routes')
    op.drop_index(op.f('ix_routes_warehouse_id'), table_name='routes')
    op.drop_index(op.f('ix_routes_driver_id'), table_name='routes')
    op.drop_index(op.f('ix_routes_tenant_id'), table_name='routes')
    op.drop_table('routes')
    op.drop_index(op.f('ix_users_tenant_id'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
    op.drop_index(op.f('ix_drivers_warehouse_id'), table_name='drivers')
    op.drop_index(op.f('ix_drivers_tenant_id'), table_name='drivers')
    op.drop_table('drivers')
    op.drop_index(op.f('ix_warehouses_tenant_id'), table_name='warehouses')
    op.drop_table('warehouses')
    op.drop_index(op.f('ix_tenants_slug'), table_name='tenants')
    op.drop_table('tenants')
