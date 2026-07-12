"""Add LLM insight tables: executive_summaries, agent_insights, copilot_conversations.

Revision ID: 003
Revises: 002
Create Date: 2026-07-11 00:00:00.000000

Ports db/migrations/004_llm_insights.sql into the Alembic chain so that
`alembic upgrade head` applies it automatically. The raw SQL file is kept
for reference but should no longer be applied manually.
"""
from alembic import op
import sqlalchemy as sa

revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # executive_summaries: AI-generated operational summaries
    op.create_table(
        'executive_summaries',
        sa.Column('id', sa.String(64), nullable=False),
        sa.Column('tenant_id', sa.String(64), nullable=False),
        sa.Column('summary_type', sa.String(30), nullable=False),
        sa.Column('summary_text', sa.Text(), nullable=False),
        sa.Column('confidence', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('evidence', sa.Text(), server_default='[]', nullable=False),
        sa.Column('recommendations', sa.Text(), server_default='[]', nullable=False),
        sa.Column('metadata', sa.Text(), server_default='{}', nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "summary_type IN ('operational', 'risk', 'driver', 'route')",
            name='ck_executive_summaries_type',
        ),
        sa.CheckConstraint(
            'confidence >= 0.0 AND confidence <= 1.0',
            name='ck_executive_summaries_confidence',
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'idx_executive_summaries_tenant', 'executive_summaries',
        ['tenant_id', 'created_at'],
    )
    op.create_index(
        'idx_executive_summaries_type', 'executive_summaries',
        ['tenant_id', 'summary_type', 'created_at'],
    )

    # agent_insights: per-order LLM analysis results
    op.create_table(
        'agent_insights',
        sa.Column('id', sa.String(64), nullable=False),
        sa.Column('order_id', sa.String(64), nullable=False),
        sa.Column('tenant_id', sa.String(64), nullable=False),
        sa.Column('driver_id', sa.String(64), nullable=True),
        sa.Column('risk_score', sa.Float(), nullable=False),
        sa.Column('llm_insight', sa.Text(), nullable=True),
        sa.Column('llm_risk_drivers', sa.Text(), server_default='[]', nullable=True),
        sa.Column('llm_suggested_actions', sa.Text(), server_default='[]', nullable=True),
        sa.Column('llm_severity', sa.String(20), nullable=True),
        sa.Column('generated_insight', sa.Text(), nullable=True),
        sa.Column('llm_latency_ms', sa.Float(), nullable=True),
        sa.Column('llm_model', sa.String(100), nullable=True),
        sa.Column('token_count', sa.Integer(), server_default='0', nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'idx_agent_insights_order', 'agent_insights',
        ['order_id', 'created_at'],
    )
    op.create_index(
        'idx_agent_insights_tenant', 'agent_insights',
        ['tenant_id', 'created_at'],
    )

    # copilot_conversations: audit trail for copilot interactions
    op.create_table(
        'copilot_conversations',
        sa.Column('id', sa.String(64), nullable=False),
        sa.Column('tenant_id', sa.String(64), nullable=False),
        sa.Column('user_query', sa.Text(), nullable=False),
        sa.Column('llm_summary', sa.Text(), nullable=True),
        sa.Column('llm_confidence', sa.Float(), nullable=True),
        sa.Column('llm_evidence', sa.Text(), server_default='[]', nullable=True),
        sa.Column('llm_recommendations', sa.Text(), server_default='[]', nullable=True),
        sa.Column('llm_metadata', sa.Text(), server_default='{}', nullable=True),
        sa.Column('llm_latency_ms', sa.Float(), nullable=True),
        sa.Column('llm_model', sa.String(100), nullable=True),
        sa.Column('token_count', sa.Integer(), server_default='0', nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'idx_copilot_conversations_tenant', 'copilot_conversations',
        ['tenant_id', 'created_at'],
    )

    # Add LLM insight fields to orders table
    op.add_column('orders', sa.Column('llm_insight', sa.Text(), nullable=True))
    op.add_column('orders', sa.Column('llm_risk_drivers', sa.Text(),
                                      server_default='[]', nullable=True))
    op.add_column('orders', sa.Column('llm_suggested_actions', sa.Text(),
                                      server_default='[]', nullable=True))
    op.add_column('orders', sa.Column('llm_severity', sa.String(20), nullable=True))
    op.add_column('orders', sa.Column('generated_insight', sa.Text(), nullable=True))
    op.add_column('orders', sa.Column('risk_level_label', sa.String(30), nullable=True))


def downgrade() -> None:
    # Remove columns added to orders
    op.drop_column('orders', 'risk_level_label')
    op.drop_column('orders', 'generated_insight')
    op.drop_column('orders', 'llm_severity')
    op.drop_column('orders', 'llm_suggested_actions')
    op.drop_column('orders', 'llm_risk_drivers')
    op.drop_column('orders', 'llm_insight')

    op.drop_table('copilot_conversations')
    op.drop_table('agent_insights')
    op.drop_table('executive_summaries')
