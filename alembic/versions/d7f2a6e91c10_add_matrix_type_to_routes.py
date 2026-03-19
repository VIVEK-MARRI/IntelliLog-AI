"""Add matrix_type to routes

Revision ID: d7f2a6e91c10
Revises: c3a1b0d9ef12
Create Date: 2026-03-19 09:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d7f2a6e91c10"
down_revision: Union[str, Sequence[str], None] = "c3a1b0d9ef12"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("routes", sa.Column("matrix_type", sa.String(), nullable=True))
    op.execute("UPDATE routes SET matrix_type = 'static_fallback' WHERE matrix_type IS NULL")
    op.alter_column("routes", "matrix_type", nullable=False)


def downgrade() -> None:
    op.drop_column("routes", "matrix_type")
