"""Add vehicle_type and zone_expertise to drivers table.

Revision ID: 2026_03_20_driver_expertise
Revises: 2026_03_20_explanations
Create Date: 2026-03-20 16:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "2026_03_20_driver_expertise"
down_revision = "2026_03_20_explanations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "drivers",
        sa.Column("vehicle_type", sa.String(), nullable=True, server_default="bike"),
    )
    op.add_column(
        "drivers",
        sa.Column("zone_expertise", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("drivers", "zone_expertise")
    op.drop_column("drivers", "vehicle_type")
