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
    category_fields: list[str] = []   # string, 2 ≤ distinct ≤ 20 (meaningful pie/bar)
    date_fields: list[str] = []
    text_fields: list[str] = []        # string, high cardinality

    for col in schema.columns:
        t = col.type.lower()
        if t in ("integer", "float", "double", "numeric", "decimal", "bigint", "number"):
            numeric_fields.append(col.name)
        elif t in ("date", "datetime", "timestamp"):
            date_fields.append(col.name)
        elif t in ("string", "text", "varchar"):
            dc = col.distinct_count or 0
            if 2 <= dc <= 20:
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

    # Build a lookup for distinct_count by column name
    distinct_map: dict[str, int] = {col.name: (col.distinct_count or 0) for col in schema.columns}

    widgets: list[dict[str, Any]] = []

    # ── Row 0: KPI cards (first 4 numeric fields, SUM) ───────────────────────
    for i, nf in enumerate(numeric_fields[:4]):
        widgets.append({
            "id": f"kpi_{i}",
            "type": "kpi",
            "title": nf,
            "position": {"row": 0, "col": i, "width": 1, "height": 1},
            "query": f'SELECT SUM(CAST("{nf}" AS DOUBLE)) AS value FROM {{table}}',
            "format": "number",
        })

    # ── Row 1: time trend line chart ─────────────────────────────────────────
    if date_fields and numeric_fields:
        df = date_fields[0]
        nf = numeric_fields[0]
        dc = distinct_map.get(df, 0)

        # If too many date points, aggregate to month (first 6 chars of string repr)
        if dc > 30:
            date_expr = f'SUBSTR(CAST("{df}" AS VARCHAR), 1, 6)'
            date_label = f"{df}(ymdhms月)"
        else:
            date_expr = f'CAST("{df}" AS VARCHAR)'
            date_label = df

        widgets.append({
            "id": "trend_1",
            "type": "chart",
            "chart_type": "line",
            "title": f"{nf}趋势（按{date_label}）",
            "position": {"row": 1, "col": 0, "width": 3, "height": 1},
            "query": (
                f'SELECT {date_expr} AS period, SUM(CAST("{nf}" AS DOUBLE)) AS total '
                f'FROM {{table}} GROUP BY {date_expr} ORDER BY {date_expr} LIMIT 60'
            ),
        })

    # ── Row 1: category pie chart (only if ≥ 2 distinct values) ─────────────
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

    # ── Row 2: TOP 10 ranking — horizontal bar ────────────────────────────────
    if text_fields and numeric_fields:
        tf = text_fields[0]
        nf = numeric_fields[0]
        widgets.append({
            "id": "ranking_1",
            "type": "chart",
            "chart_type": "bar_horizontal",
            "title": f"{tf} TOP 10",
            "position": {"row": 2, "col": 0, "width": 5, "height": 1},
            "query": (
                f'SELECT "{tf}", SUM(CAST("{nf}" AS DOUBLE)) AS total '
                f'FROM {{table}} GROUP BY "{tf}" ORDER BY total DESC LIMIT 10'
            ),
        })

    # ── Row 3: second numeric by category ────────────────────────────────────
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

    # ── Filters ───────────────────────────────────────────────────────────────
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
