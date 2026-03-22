"""permission_tables

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-22 00:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── dataset_access ────────────────────────────────────────────────────────
    op.create_table(
        "dataset_access",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "dataset_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("datasets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("grantee_type", sa.String(20), nullable=False),
        sa.Column("grantee_id", sa.String(100), nullable=False),
        sa.Column("access_level", sa.String(20), nullable=False, server_default="read"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_dataset_access_dataset_id", "dataset_access", ["dataset_id"])

    # ── rls_rules ─────────────────────────────────────────────────────────────
    op.create_table(
        "rls_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "dataset_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("datasets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("condition_type", sa.String(50), nullable=False),
        sa.Column("field", sa.String(100), nullable=False),
        sa.Column("operator", sa.String(20), nullable=False),
        sa.Column("value_source", sa.Text(), nullable=False),
        sa.Column(
            "applies_to_roles",
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "exempt_roles",
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default="{admin}",
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_rls_rules_dataset_id", "rls_rules", ["dataset_id"])

    # ── column_masks ──────────────────────────────────────────────────────────
    op.create_table(
        "column_masks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "dataset_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("datasets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("column_name", sa.String(100), nullable=False),
        sa.Column("mask_type", sa.String(20), nullable=False),
        sa.Column(
            "applies_to_roles",
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "exempt_roles",
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default="{admin}",
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.create_index("ix_column_masks_dataset_id", "column_masks", ["dataset_id"])


def downgrade() -> None:
    op.drop_table("column_masks")
    op.drop_table("rls_rules")
    op.drop_table("dataset_access")
