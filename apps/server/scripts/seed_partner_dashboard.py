"""
Seed script: create '合作伙伴贡献度看板' in the existing dashboard system.
Run: python seed_partner_dashboard.py
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.models.dashboard import DashboardConfig

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://metadatahub:metadatahub@localhost:5432/metadatahub",
)

DASHBOARD_CONFIG = {
    "title": "合作伙伴贡献度看板",
    "dataset_id": None,
    "table_name": "",
    "filters": [],
    "widgets": [
        {
            "id": "kpi_total_partners",
            "type": "kpi",
            "title": "活跃伙伴总数",
            "query": "SELECT COUNT(*) AS value FROM partners WHERE is_active = true",
            "format": "number",
            "position": {"col": 0, "row": 0, "width": 1, "height": 1},
        },
        {
            "id": "kpi_avg_score",
            "type": "kpi",
            "title": "平均综合评分",
            "query": "SELECT ROUND(AVG(total_score), 2) AS value FROM partners WHERE is_active = true",
            "format": "decimal",
            "position": {"col": 1, "row": 0, "width": 1, "height": 1},
        },
        {
            "id": "kpi_strategic",
            "type": "kpi",
            "title": "战略伙伴数量",
            "query": "SELECT COUNT(*) AS value FROM partners WHERE is_active = true AND tier = 'strategic'",
            "format": "number",
            "position": {"col": 2, "row": 0, "width": 1, "height": 1},
        },
        {
            "id": "kpi_risk",
            "type": "kpi",
            "title": "风险伙伴数量",
            "query": "SELECT COUNT(*) AS value FROM partners WHERE is_active = true AND tier = 'risk'",
            "format": "number",
            "position": {"col": 3, "row": 0, "width": 1, "height": 1},
        },
        {
            "id": "pie_tier",
            "type": "chart",
            "chart_type": "pie",
            "title": "伙伴等级分布",
            "query": (
                "SELECT tier AS name, COUNT(*) AS value "
                "FROM partners WHERE is_active = true "
                "GROUP BY tier ORDER BY value DESC"
            ),
            "position": {"col": 0, "row": 1, "width": 2, "height": 2},
        },
        {
            "id": "bar_region_score",
            "type": "chart",
            "chart_type": "bar",
            "title": "各区域平均评分",
            "query": (
                "SELECT region, ROUND(AVG(total_score), 2) AS avg_score "
                "FROM partners WHERE is_active = true "
                "GROUP BY region ORDER BY avg_score DESC"
            ),
            "position": {"col": 2, "row": 1, "width": 3, "height": 2},
        },
        {
            "id": "ranking_top10",
            "type": "chart",
            "chart_type": "bar_horizontal",
            "title": "TOP 10 高分伙伴",
            "query": (
                "SELECT name, total_score "
                "FROM partners WHERE is_active = true "
                "ORDER BY total_score DESC LIMIT 10"
            ),
            "position": {"col": 0, "row": 3, "width": 5, "height": 2},
        },
    ],
}


async def main() -> None:
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Check if dashboard already exists
        result = await session.execute(
            select(DashboardConfig).where(DashboardConfig.name == "合作伙伴贡献度看板")
        )
        existing = result.scalar_one_or_none()
        if existing:
            print(f"Dashboard already exists: {existing.id}")
            await engine.dispose()
            return

        # Find admin user id
        from app.models.user import User
        user_result = await session.execute(
            select(User).where(User.email == "admin@metadatahub.local")
        )
        admin = user_result.scalar_one_or_none()
        admin_id = admin.id if admin else uuid.uuid4()

        dashboard = DashboardConfig(
            id=uuid.uuid4(),
            name="合作伙伴贡献度看板",
            dataset_id=None,
            config=DASHBOARD_CONFIG,
            dashboard_type="fixed",
            is_default=False,
            is_pinned=True,
            sort_order=0,
            owner_id=admin_id,
            created_by=admin_id,
        )
        session.add(dashboard)
        await session.commit()
        await session.refresh(dashboard)
        print(f"Created dashboard: {dashboard.id}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
