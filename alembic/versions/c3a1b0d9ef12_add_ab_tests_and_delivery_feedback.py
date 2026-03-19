"""Add ab_tests and delivery_feedback tables

Revision ID: c3a1b0d9ef12
Revises: bb091f6b76c8
Create Date: 2026-03-18 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c3a1b0d9ef12"
down_revision: Union[str, Sequence[str], None] = "bb091f6b76c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "ab_tests",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("model_a_version", sa.String(), nullable=False),
        sa.Column("model_b_version", sa.String(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("ends_at", sa.DateTime(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("winner", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ab_tests_tenant_id"), "ab_tests", ["tenant_id"], unique=False)

    op.create_table(
        "delivery_feedback",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("order_id", sa.String(), nullable=False),
        sa.Column("prediction_model_version", sa.String(), nullable=False),
        sa.Column("predicted_eta_min", sa.Float(), nullable=False),
        sa.Column("actual_delivery_min", sa.Float(), nullable=True),
        sa.Column("predicted_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_delivery_feedback_order_id"), "delivery_feedback", ["order_id"], unique=False)
    op.create_index(
        op.f("ix_delivery_feedback_prediction_model_version"),
        "delivery_feedback",
        ["prediction_model_version"],
        unique=False,
    )
    op.create_index(op.f("ix_delivery_feedback_predicted_at"), "delivery_feedback", ["predicted_at"], unique=False)
    op.create_index(op.f("ix_delivery_feedback_tenant_id"), "delivery_feedback", ["tenant_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_delivery_feedback_tenant_id"), table_name="delivery_feedback")
    op.drop_index(op.f("ix_delivery_feedback_predicted_at"), table_name="delivery_feedback")
    op.drop_index(op.f("ix_delivery_feedback_prediction_model_version"), table_name="delivery_feedback")
    op.drop_index(op.f("ix_delivery_feedback_order_id"), table_name="delivery_feedback")
    op.drop_table("delivery_feedback")

    op.drop_index(op.f("ix_ab_tests_tenant_id"), table_name="ab_tests")
    op.drop_table("ab_tests")
