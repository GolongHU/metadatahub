"""partner_system: org_structure, partners, partner_metrics, partner_scores, metric_visibility

Revision ID: 0006
Revises: 0005
Create Date: 2026-03-24
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, TEXT, UUID

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Add org_role to users ──────────────────────────────────────────────────
    op.add_column("users", sa.Column("org_role", sa.String(50), nullable=True))

    # ── org_structure ──────────────────────────────────────────────────────────
    op.create_table(
        "org_structure",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("role", sa.String(50), nullable=False),
        sa.Column("region", sa.String(50), nullable=False),
        sa.Column("parent_id", UUID(as_uuid=True), sa.ForeignKey("org_structure.id"), nullable=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_org_structure_region", "org_structure", ["region"])

    # ── partners ───────────────────────────────────────────────────────────────
    op.create_table(
        "partners",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("short_name", sa.String(50), nullable=True),
        sa.Column("region", sa.String(50), nullable=False),
        sa.Column("manager_id", UUID(as_uuid=True), sa.ForeignKey("org_structure.id"), nullable=True),
        sa.Column("tier", sa.String(50), nullable=False, server_default="growth"),
        sa.Column("total_score", sa.Numeric(4, 2), nullable=False, server_default="5.0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("joined_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_partners_region", "partners", ["region"])
    op.create_index("ix_partners_tier", "partners", ["tier"])

    # ── partner_metrics ────────────────────────────────────────────────────────
    op.create_table(
        "partner_metrics",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("partner_id", UUID(as_uuid=True), sa.ForeignKey("partners.id"), nullable=False),
        sa.Column("period", sa.String(10), nullable=False),
        sa.Column("period_type", sa.String(10), nullable=False),
        sa.Column("dimension", sa.String(50), nullable=False),
        sa.Column("metric_key", sa.String(100), nullable=False),
        sa.Column("metric_name", sa.String(200), nullable=False),
        sa.Column("value", sa.Numeric(20, 4), nullable=False),
        sa.Column("unit", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("partner_id", "period", "metric_key", name="uq_partner_period_metric"),
    )
    op.create_index("ix_partner_metrics_partner_id", "partner_metrics", ["partner_id"])
    op.create_index("ix_partner_metrics_period", "partner_metrics", ["period"])
    op.create_index("ix_partner_metrics_dimension", "partner_metrics", ["dimension"])

    # ── partner_scores ─────────────────────────────────────────────────────────
    op.create_table(
        "partner_scores",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("partner_id", UUID(as_uuid=True), sa.ForeignKey("partners.id"), nullable=False),
        sa.Column("period", sa.String(10), nullable=False),
        sa.Column("performance_score", sa.Numeric(4, 2), nullable=True),
        sa.Column("growth_score", sa.Numeric(4, 2), nullable=True),
        sa.Column("engagement_score", sa.Numeric(4, 2), nullable=True),
        sa.Column("health_score", sa.Numeric(4, 2), nullable=True),
        sa.Column("activity_score", sa.Numeric(4, 2), nullable=True),
        sa.Column("total_score", sa.Numeric(4, 2), nullable=True),
        sa.Column("tier", sa.String(50), nullable=True),
        sa.Column("tier_change", sa.String(20), nullable=True),
        sa.Column("red_flag", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("partner_id", "period", name="uq_partner_score_period"),
    )
    op.create_index("ix_partner_scores_partner_id", "partner_scores", ["partner_id"])

    # ── metric_visibility ──────────────────────────────────────────────────────
    op.create_table(
        "metric_visibility",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("metric_key", sa.String(100), nullable=False, unique=True),
        sa.Column("visible_roles", ARRAY(TEXT), nullable=False),
    )
    op.create_index("ix_metric_visibility_key", "metric_visibility", ["metric_key"])


def downgrade() -> None:
    op.drop_table("metric_visibility")
    op.drop_table("partner_scores")
    op.drop_table("partner_metrics")
    op.drop_table("partners")
    op.drop_table("org_structure")
    op.drop_column("users", "org_role")
