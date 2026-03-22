"""dashboard multi-type support

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-22
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "dashboard_configs",
        sa.Column("dashboard_type", sa.String(20), nullable=False, server_default="auto"),
    )
    op.add_column(
        "dashboard_configs",
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "dashboard_configs",
        sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "dashboard_configs",
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_dashboard_configs_owner_id", "dashboard_configs", ["owner_id"])


def downgrade() -> None:
    op.drop_index("ix_dashboard_configs_owner_id", "dashboard_configs")
    op.drop_column("dashboard_configs", "sort_order")
    op.drop_column("dashboard_configs", "is_pinned")
    op.drop_column("dashboard_configs", "owner_id")
    op.drop_column("dashboard_configs", "dashboard_type")
