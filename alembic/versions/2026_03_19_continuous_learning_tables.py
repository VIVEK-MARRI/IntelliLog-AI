"""Add continuous learning tables for drift detection and model management.

Revision ID: 1a2b3c4d5e6f7g8h
Revises: 
Create Date: 2026-03-19 04:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1a2b3c4d5e6f7g8h'
down_revision = '2026_03_20_driver_expertise'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Compatibility no-op.

    Continuous-learning tables are already introduced by prior revisions in this
    repository's linear migration chain.
    """
    pass


def downgrade() -> None:
    """Compatibility no-op."""
    pass
