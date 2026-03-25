"""Seed widget library (8 types) and 4 role-based starter templates."""
from __future__ import annotations

import asyncio
import sys
import uuid

sys.path.insert(0, "/app")

from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.dashboard import DashboardConfig, WidgetLibrary


WIDGETS = [
    WidgetLibrary(
        id="kpi_card",
        name="KPI 指标卡",
        description="展示单一核心指标，支持环比/同比趋势",
        category="metric",
        sort_order=1,
        config_schema={
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "返回单行：value, label, trend(%)"},
                "format": {"type": "string", "enum": ["number", "currency", "percent"], "default": "number"},
                "prefix": {"type": "string"},
                "suffix": {"type": "string"},
                "color_rules": {"type": "array"},
            },
            "required": ["query"],
        },
        default_config={"format": "number", "prefix": "", "suffix": ""},
    ),
    WidgetLibrary(
        id="line_chart",
        name="折线图",
        description="时序趋势图，支持多系列",
        category="chart",
        sort_order=2,
        config_schema={
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "x_field": {"type": "string"},
                "y_fields": {"type": "array", "items": {"type": "string"}},
                "smooth": {"type": "boolean", "default": True},
            },
            "required": ["query", "x_field", "y_fields"],
        },
        default_config={"smooth": True},
    ),
    WidgetLibrary(
        id="bar_chart",
        name="柱状图",
        description="分类对比，支持堆叠与分组",
        category="chart",
        sort_order=3,
        config_schema={
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "x_field": {"type": "string"},
                "y_fields": {"type": "array", "items": {"type": "string"}},
                "stack": {"type": "boolean", "default": False},
                "horizontal": {"type": "boolean", "default": False},
            },
            "required": ["query", "x_field", "y_fields"],
        },
        default_config={"stack": False, "horizontal": False},
    ),
    WidgetLibrary(
        id="pie_chart",
        name="饼图 / 环图",
        description="占比分析，支持环形模式",
        category="chart",
        sort_order=4,
        config_schema={
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "name_field": {"type": "string"},
                "value_field": {"type": "string"},
                "donut": {"type": "boolean", "default": True},
            },
            "required": ["query", "name_field", "value_field"],
        },
        default_config={"donut": True},
    ),
    WidgetLibrary(
        id="radar_chart",
        name="雷达图",
        description="多维能力评估",
        category="chart",
        sort_order=5,
        config_schema={
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "dimensions": {"type": "array", "items": {"type": "string"}},
                "max_value": {"type": "number", "default": 10},
            },
            "required": ["query", "dimensions"],
        },
        default_config={"max_value": 10},
    ),
    WidgetLibrary(
        id="ranking_table",
        name="排行榜表格",
        description="带排名徽章的数据表格",
        category="table",
        sort_order=6,
        config_schema={
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "columns": {"type": "array", "items": {"type": "object"}},
                "rank_field": {"type": "string"},
                "page_size": {"type": "number", "default": 10},
            },
            "required": ["query"],
        },
        default_config={"page_size": 10},
    ),
    WidgetLibrary(
        id="alert_list",
        name="预警列表",
        description="显示风险/异常合作伙伴列表",
        category="alert",
        sort_order=7,
        config_schema={
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "severity_field": {"type": "string"},
                "message_field": {"type": "string"},
                "max_items": {"type": "number", "default": 8},
            },
            "required": ["query"],
        },
        default_config={"max_items": 8},
    ),
    WidgetLibrary(
        id="action_items",
        name="待办事项",
        description="展示需要跟进的行动项",
        category="alert",
        sort_order=8,
        config_schema={
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "title_field": {"type": "string"},
                "priority_field": {"type": "string"},
                "due_date_field": {"type": "string"},
            },
            "required": ["query"],
        },
        default_config={},
    ),
]


TEMPLATE_DEFS = [
    {
        "name": "管理员全局总览",
        "template_type": "system",
        "assigned_roles": ["admin"],
        "tags": ["admin", "overview", "system"],
        "config": {
            "layout": {"columns": 6, "row_height": 160},
            "filters": [],
            "widgets": [
                {"id": "w1", "type": "kpi_card", "title": "合作伙伴总数", "position": {"row": 0, "col": 0, "col_span": 1, "row_span": 1}, "config": {"query": "SELECT COUNT(*) AS value FROM partners", "format": "number"}},
                {"id": "w2", "type": "kpi_card", "title": "战略级伙伴", "position": {"row": 0, "col": 1, "col_span": 1, "row_span": 1}, "config": {"query": "SELECT COUNT(*) AS value FROM partners WHERE tier='strategic'", "format": "number"}},
                {"id": "w3", "type": "kpi_card", "title": "风险预警数", "position": {"row": 0, "col": 2, "col_span": 1, "row_span": 1}, "config": {"query": "SELECT COUNT(*) AS value FROM partners WHERE tier='risk'", "format": "number"}},
                {"id": "w4", "type": "pie_chart", "title": "等级分布", "position": {"row": 1, "col": 0, "col_span": 2, "row_span": 2}, "config": {"query": "SELECT tier AS name, COUNT(*) AS value FROM partners GROUP BY tier", "name_field": "name", "value_field": "value", "donut": True}},
                {"id": "w5", "type": "ranking_table", "title": "合作伙伴总览", "position": {"row": 1, "col": 2, "col_span": 4, "row_span": 2}, "config": {"query": "SELECT name, tier, total_score FROM partners ORDER BY total_score DESC LIMIT 20", "page_size": 10}},
                {"id": "w6", "type": "alert_list", "title": "风险预警", "position": {"row": 3, "col": 0, "col_span": 3, "row_span": 1}, "config": {"query": "SELECT name AS message, 'high' AS severity FROM partners WHERE tier='risk' LIMIT 8", "severity_field": "severity", "message_field": "message"}},
            ],
        },
    },
    {
        "name": "区域主管看板",
        "template_type": "system",
        "assigned_roles": ["analyst"],
        "tags": ["analyst", "region", "system"],
        "config": {
            "layout": {"columns": 6, "row_height": 160},
            "filters": [],
            "widgets": [
                {"id": "w1", "type": "kpi_card", "title": "区域伙伴数", "position": {"row": 0, "col": 0, "col_span": 2, "row_span": 1}, "config": {"query": "SELECT COUNT(*) AS value FROM partners", "format": "number"}},
                {"id": "w2", "type": "kpi_card", "title": "平均综合评分", "position": {"row": 0, "col": 2, "col_span": 2, "row_span": 1}, "config": {"query": "SELECT ROUND(AVG(total_score)::numeric,1) AS value FROM partners", "format": "number"}},
                {"id": "w3", "type": "radar_chart", "title": "区域能力雷达", "position": {"row": 1, "col": 0, "col_span": 3, "row_span": 2}, "config": {"query": "SELECT 'performance' AS dim, 7.5 AS score UNION ALL SELECT 'growth',6.8 UNION ALL SELECT 'engagement',8.1 UNION ALL SELECT 'health',7.2 UNION ALL SELECT 'activity',6.5", "dimensions": ["performance", "growth", "engagement", "health", "activity"]}},
                {"id": "w4", "type": "ranking_table", "title": "伙伴排行", "position": {"row": 1, "col": 3, "col_span": 3, "row_span": 2}, "config": {"query": "SELECT name, tier, total_score FROM partners ORDER BY total_score DESC LIMIT 15", "page_size": 10}},
            ],
        },
    },
    {
        "name": "合作伙伴经理看板",
        "template_type": "system",
        "assigned_roles": ["viewer"],
        "tags": ["viewer", "manager", "system"],
        "config": {
            "layout": {"columns": 6, "row_height": 160},
            "filters": [],
            "widgets": [
                {"id": "w1", "type": "kpi_card", "title": "负责伙伴数", "position": {"row": 0, "col": 0, "col_span": 2, "row_span": 1}, "config": {"query": "SELECT COUNT(*) AS value FROM partners", "format": "number"}},
                {"id": "w2", "type": "bar_chart", "title": "伙伴评分对比", "position": {"row": 1, "col": 0, "col_span": 4, "row_span": 2}, "config": {"query": "SELECT name, total_score FROM partners ORDER BY total_score DESC LIMIT 10", "x_field": "name", "y_fields": ["total_score"]}},
                {"id": "w3", "type": "action_items", "title": "待办跟进", "position": {"row": 1, "col": 4, "col_span": 2, "row_span": 2}, "config": {"query": "SELECT name AS title, 'high' AS priority FROM partners WHERE tier='risk' LIMIT 5", "title_field": "title", "priority_field": "priority"}},
            ],
        },
    },
    {
        "name": "合作伙伴自助看板",
        "template_type": "system",
        "assigned_roles": ["partner"],
        "tags": ["partner", "self", "system"],
        "config": {
            "layout": {"columns": 6, "row_height": 160},
            "filters": [],
            "widgets": [
                {"id": "w1", "type": "kpi_card", "title": "综合评分", "position": {"row": 0, "col": 0, "col_span": 2, "row_span": 1}, "config": {"query": "SELECT total_score AS value FROM partners LIMIT 1", "format": "number"}},
                {"id": "w2", "type": "radar_chart", "title": "五维能力", "position": {"row": 1, "col": 0, "col_span": 3, "row_span": 2}, "config": {"query": "SELECT dimension AS dim, score FROM partner_metrics WHERE period='2025-03' LIMIT 5", "dimensions": ["performance", "growth", "engagement", "health", "activity"]}},
                {"id": "w3", "type": "line_chart", "title": "评分趋势", "position": {"row": 1, "col": 3, "col_span": 3, "row_span": 2}, "config": {"query": "SELECT period, total_score FROM partner_score_history ORDER BY period LIMIT 12", "x_field": "period", "y_fields": ["total_score"]}},
            ],
        },
    },
]


async def main() -> None:
    async with AsyncSessionLocal() as db:
        # Upsert widget library via merge
        for w in WIDGETS:
            existing = await db.get(WidgetLibrary, w.id)
            if existing:
                existing.name = w.name
                existing.description = w.description
                existing.category = w.category
                existing.config_schema = w.config_schema
                existing.default_config = w.default_config
                existing.sort_order = w.sort_order
            else:
                db.add(w)
        await db.flush()
        print(f"Seeded {len(WIDGETS)} widget types")

        # Seed templates (skip if already exist by name + system type)
        for t in TEMPLATE_DEFS:
            result = await db.execute(
                select(DashboardConfig).where(
                    DashboardConfig.name == t["name"],
                    DashboardConfig.template_type == "system",
                )
            )
            if result.scalar_one_or_none():
                print(f"  Template '{t['name']}' already exists, skipping")
                continue

            dc = DashboardConfig(
                id=uuid.uuid4(),
                name=t["name"],
                dataset_id=None,
                config=t["config"],
                is_default=False,
                dashboard_type="template",
                owner_id=None,
                is_pinned=False,
                sort_order=0,
                template_type=t["template_type"],
                assigned_roles=t["assigned_roles"],
                source_dataset_ids=[],
                version=1,
                is_published=False,
                tags=t["tags"],
            )
            db.add(dc)
            print(f"  Created template '{t['name']}'")

        await db.commit()
        print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
