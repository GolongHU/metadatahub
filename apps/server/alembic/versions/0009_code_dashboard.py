"""code_dashboard: add render_mode, code_snapshot to dashboard_configs; add dashboard_skills table

Revision ID: 0009
Revises: 0008
Create Date: 2026-04-16
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add render_mode and code_snapshot to dashboard_configs
    op.add_column(
        "dashboard_configs",
        sa.Column("render_mode", sa.String(10), nullable=False, server_default="json"),
    )
    op.add_column(
        "dashboard_configs",
        sa.Column("code_snapshot", sa.Text, nullable=True),
    )

    # Create dashboard_skills table
    op.create_table(
        "dashboard_skills",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("trigger_keywords", sa.ARRAY(sa.Text), nullable=True),
        sa.Column("required_fields", sa.JSON, nullable=True),
        sa.Column("analysis_prompt", sa.Text, nullable=True),
        sa.Column("design_notes", sa.Text, nullable=True),
        sa.Column("is_builtin", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    # Seed built-in skills
    op.execute("""
        INSERT INTO dashboard_skills
            (id, name, description, category, trigger_keywords, required_fields,
             analysis_prompt, is_builtin, is_active, sort_order)
        VALUES
        (
            'partner_health',
            '伙伴回款健康度',
            '分析合作伙伴的回款风险，包括逾期金额、回款及时率、负责人追踪',
            'health',
            ARRAY['健康度','回款','逾期','风险','应收'],
            '{"needs_amount": true, "needs_partner": true}'::jsonb,
            '你是一个专注于合作伙伴回款风险的分析师。重点关注：1.逾期金额最大的伙伴 2.按负责人追踪回款责任 3.按区域对比健康度 4.回款及时率分布 5.活跃vs沉默伙伴区分',
            true, true, 1
        ),
        (
            'sales_performance',
            '销售业绩分析',
            '分析签约金额、订单趋势、客户结构、产品线分布',
            'sales',
            ARRAY['业绩','签约','销售','订单','营收','GMV'],
            '{"needs_amount": true}'::jsonb,
            '你是一个专注于销售业绩的分析师。重点关注：1.关键业绩KPI 2.时间趋势 3.客户/伙伴排名 4.产品线结构 5.区域分布',
            true, true, 2
        ),
        (
            'contribution_scoring',
            '伙伴贡献度评分',
            '多维度伙伴评分分析，包括层级分布、维度雷达图、排名对比',
            'scoring',
            ARRAY['贡献度','评分','评级','层级','tier','PRI','共振'],
            '{"needs_score": true, "needs_partner": true}'::jsonb,
            '你是一个专注于伙伴价值评估的分析师。重点关注：1.层级分布 2.各维度得分对比 3.区域横向对比 4.TOP/BOTTOM排名 5.趋势变化',
            true, true, 3
        )
    """)


def downgrade() -> None:
    op.drop_table("dashboard_skills")
    op.drop_column("dashboard_configs", "code_snapshot")
    op.drop_column("dashboard_configs", "render_mode")
