"""Align delivery_feedback schema with ORM model.

Revision ID: 20260321_df_align
Revises: 1a2b3c4d5e6f7g8h
Create Date: 2026-03-21 16:15:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260321_df_align"
down_revision = "1a2b3c4d5e6f7g8h"
branch_labels = None
depends_on = None


def _column_names(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return {col["name"] for col in inspector.get_columns(table_name)}


def upgrade() -> None:
    existing = _column_names("delivery_feedback")

    if "driver_id" not in existing:
        op.add_column("delivery_feedback", sa.Column("driver_id", sa.String(), nullable=True))
    if "error_min" not in existing:
        op.add_column("delivery_feedback", sa.Column("error_min", sa.Float(), nullable=True))
    if "traffic_condition" not in existing:
        op.add_column("delivery_feedback", sa.Column("traffic_condition", sa.String(), nullable=True))
    if "weather" not in existing:
        op.add_column("delivery_feedback", sa.Column("weather", sa.String(), nullable=True))
    if "vehicle_type" not in existing:
        op.add_column("delivery_feedback", sa.Column("vehicle_type", sa.String(), nullable=True))
    if "distance_km" not in existing:
        op.add_column("delivery_feedback", sa.Column("distance_km", sa.Float(), nullable=True))
    if "time_of_day" not in existing:
        op.add_column("delivery_feedback", sa.Column("time_of_day", sa.String(), nullable=True))
    if "day_of_week" not in existing:
        op.add_column("delivery_feedback", sa.Column("day_of_week", sa.Integer(), nullable=True))
    if "delivered_at" not in existing:
        op.add_column("delivery_feedback", sa.Column("delivered_at", sa.DateTime(), nullable=True))
    if "created_at" not in existing:
        op.add_column(
            "delivery_feedback",
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        )


def downgrade() -> None:
    existing = _column_names("delivery_feedback")

    for col_name in [
        "created_at",
        "delivered_at",
        "day_of_week",
        "time_of_day",
        "distance_km",
        "vehicle_type",
        "weather",
        "traffic_condition",
        "error_min",
        "driver_id",
    ]:
        if col_name in existing:
            op.drop_column("delivery_feedback", col_name)
