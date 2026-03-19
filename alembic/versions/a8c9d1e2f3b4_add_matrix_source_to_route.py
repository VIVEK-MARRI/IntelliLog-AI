"""add_matrix_source_to_route

Revision ID: a8c9d1e2f3b4
Revises: f1b2c3d4e5f6
Create Date: 2026-03-19 18:30:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a8c9d1e2f3b4"
down_revision: Union[str, Sequence[str], None] = "f1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("routes", sa.Column("matrix_source", sa.String(), nullable=True))
    op.execute("UPDATE routes SET matrix_source = matrix_type WHERE matrix_source IS NULL")


def downgrade() -> None:
    op.drop_column("routes", "matrix_source")
