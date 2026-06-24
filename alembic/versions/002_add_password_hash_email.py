"""Add email and password_hash to tenants; separate from api_key_hash.

Revision ID: 002
Revises: 001
Create Date: 2026-06-16 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('tenants', sa.Column('email', sa.String(255), nullable=True))
    op.add_column('tenants', sa.Column('password_hash', sa.String(255), nullable=True))
    op.create_unique_constraint('uq_tenants_email', 'tenants', ['email'])
    op.drop_constraint('tenants_api_key_hash_key', 'tenants', type_='unique')
    op.create_index('idx_tenants_email', 'tenants', ['email'])


def downgrade() -> None:
    op.drop_index('idx_tenants_email', 'tenants')
    op.create_unique_constraint('tenants_api_key_hash_key', 'tenants', ['api_key_hash'])
    op.drop_constraint('uq_tenants_email', 'tenants', type_='unique')
    op.drop_column('tenants', 'password_hash')
    op.drop_column('tenants', 'email')
