from __future__ import annotations

from typing import Any

from app.schemas.dataset import DatasetSchema


def generate_dashboard_config(
    dataset_name: str,
    dataset_id: str,
    schema: DatasetSchema,
    table_name: str,
) -> dict:
    """
    Analyze dataset schema and auto-generate a dashboard config.
    Uses pre-computed distinct_count to classify fields — no DB queries needed.
    """
    numeric_fields: list[str] = []
    category_fields: list[str] = []   # string, low cardinality (≤ 20)
    date_fields: list[str] = []
    text_fields: list[str] = []        # string, high cardinality

    for col in schema.columns:
        t = col.type.lower()
        if t in ("integer", "float", "double", "numeric", "decimal", "bigint", "number"):
            numeric_fields.append(col.name)
        elif t in ("date", "datetime", "timestamp"):
            date_fields.append(col.name)
        elif t in ("string", "text", "varchar"):
            if col.distinct_count and col.distinct_count <= 20:
                category_fields.append(col.name)
            else:
                text_fields.append(col.name)

    # Fallback: detect date-like fields by name
    if not date_fields:
        for col in schema.columns:
            n = col.name.lower()
            if any(k in n for k in ["月", "日期", "date", "time", "year", "month", "period", "年"]):
                if col.name not in date_fields:
                    date_fields.append(col.name)

    widgets: list[dict[str, Any]] = []

    # Row 0: KPI cards (first 4 numeric fields)
    for i, nf in enumerate(numeric_fields[:4]):
        widgets.append({
            "id": f"kpi_{i}",
            "type": "kpi",
            "title": nf,
            "position": {"row": 0, "col": i, "width": 1, "height": 1},
            "query": f'SELECT SUM(CAST("{nf}" AS DOUBLE)) AS value, COUNT(*) AS count FROM {{table}}',
            "format": "number",
        })

    # Row 1: time trend line chart
    if date_fields and numeric_fields:
        df = date_fields[0]
        nf = numeric_fields[0]
        widgets.append({
            "id": "trend_1",
            "type": "chart",
            "chart_type": "line",
            "title": f"{nf}趋势（按{df}）",
            "position": {"row": 1, "col": 0, "width": 3, "height": 1},
            "query": (
                f'SELECT "{df}", SUM(CAST("{nf}" AS DOUBLE)) AS total '
                f'FROM {{table}} GROUP BY "{df}" ORDER BY "{df}"'
            ),
        })

    # Row 1: category pie chart
    if category_fields and numeric_fields:
        cf = category_fields[0]
        nf = numeric_fields[0]
        widgets.append({
            "id": "pie_1",
            "type": "chart",
            "chart_type": "pie",
            "title": f"按{cf}分布",
            "position": {"row": 1, "col": 3, "width": 2, "height": 1},
            "query": (
                f'SELECT "{cf}", SUM(CAST("{nf}" AS DOUBLE)) AS total '
                f'FROM {{table}} GROUP BY "{cf}" ORDER BY total DESC LIMIT 10'
            ),
        })

    # Row 2: TOP 10 ranking bar chart (high-cardinality text field)
    if text_fields and numeric_fields:
        tf = text_fields[0]
        nf = numeric_fields[0]
        widgets.append({
            "id": "ranking_1",
            "type": "chart",
            "chart_type": "bar",
            "title": f"{tf} TOP 10",
            "position": {"row": 2, "col": 0, "width": 5, "height": 1},
            "query": (
                f'SELECT "{tf}", SUM(CAST("{nf}" AS DOUBLE)) AS total '
                f'FROM {{table}} GROUP BY "{tf}" ORDER BY total DESC LIMIT 10'
            ),
        })

    # Row 3: second numeric field by category
    if len(numeric_fields) >= 2 and category_fields:
        cf = category_fields[0]
        nf2 = numeric_fields[1]
        widgets.append({
            "id": "bar_1",
            "type": "chart",
            "chart_type": "bar",
            "title": f"各{cf}的{nf2}",
            "position": {"row": 3, "col": 0, "width": 5, "height": 1},
            "query": (
                f'SELECT "{cf}", SUM(CAST("{nf2}" AS DOUBLE)) AS total '
                f'FROM {{table}} GROUP BY "{cf}" ORDER BY total DESC'
            ),
        })

    # Filters
    filters = []
    if date_fields:
        filters.append({
            "id": f"filter_{date_fields[0]}",
            "type": "select",
            "field": date_fields[0],
            "label": date_fields[0],
            "options": "auto",
        })
    for cf in category_fields[:2]:
        filters.append({
            "id": f"filter_{cf}",
            "type": "select",
            "field": cf,
            "label": cf,
            "options": "auto",
        })

    return {
        "title": f"{dataset_name} 数据看板",
        "dataset_id": dataset_id,
        "table_name": table_name,
        "filters": filters,
        "widgets": widgets,
    }
