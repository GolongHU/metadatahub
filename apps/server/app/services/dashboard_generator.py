"""dashboard_generator.py — AI 原生看板生成链路

新流程:
  上传 → 数据画像(DataProfiler) → AI业务理解(DataInterpreter)
       → 选叙事模式 → 生成 widgets → 写入 DB
"""
from __future__ import annotations

import json
import re
import uuid
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.data_interpreter import DataInterpretation
from app.services.data_profiler import DataProfile

_executor = ThreadPoolExecutor(max_workers=2)

# ── Format hints ──────────────────────────────────────────────────────────────

_FORMAT_MAP = {
    "currency_wan": "currency_wan",
    "percent": "percent",
    "count": "number",
    "score": "number",
    "auto": "number",
}

# ── Widget builders ───────────────────────────────────────────────────────────

def _uid(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def _build_kpi_widget(spec, row_idx: int) -> dict:
    field = spec.field
    agg = spec.aggregation.upper()
    fmt = _FORMAT_MAP.get(spec.format, "number")

    sql = f'SELECT {agg}(CAST("{{{{field}}}}" AS DOUBLE)) AS value FROM {{table}}'.replace(
        '{{field}}', field
    )
    if spec.filter:
        sql += f" WHERE {spec.filter}"

    return {
        "id": _uid("kpi"),
        "type": "kpi",
        "title": spec.title,
        "position": {"row": 0, "col": row_idx, "width": 1, "height": 1},
        "query": sql,
        "format": fmt,
    }


def _fallback_chart_sql(spec, table_name: str) -> str:
    """当 AI SQL 生成失败时，使用简单的 fallback SQL。"""
    x = spec.x_field
    y = spec.y_field
    ct = spec.type

    if ct == "pie" and x and y:
        return (
            f'SELECT "{x}" AS name, SUM(CAST("{y}" AS DOUBLE)) AS value '
            f'FROM {{table}} GROUP BY "{x}" ORDER BY value DESC LIMIT 10'
        )
    elif ct == "line" and x and y:
        return (
            f'SELECT CAST("{x}" AS VARCHAR) AS period, '
            f'SUM(CAST("{y}" AS DOUBLE)) AS value '
            f'FROM {{table}} GROUP BY CAST("{x}" AS VARCHAR) '
            f'ORDER BY CAST("{x}" AS VARCHAR) LIMIT 60'
        )
    elif ct == "bar_horizontal" and x and y:
        return (
            f'SELECT "{x}" AS name, SUM(CAST("{y}" AS DOUBLE)) AS value '
            f'FROM {{table}} GROUP BY "{x}" ORDER BY value DESC LIMIT 10'
        )
    elif x and y:
        return (
            f'SELECT "{x}" AS category, SUM(CAST("{y}" AS DOUBLE)) AS value '
            f'FROM {{table}} GROUP BY "{x}" ORDER BY value DESC LIMIT 20'
        )
    return f'SELECT * FROM {{table}} LIMIT 10'


async def _ai_chart_sql(
    spec,
    table_name: str,
    interpretation: DataInterpretation,
    db: AsyncSession,
) -> str:
    """让 AI 为单个图表生成最优 SQL，失败则使用 fallback。"""
    from app.services.ai_engine import _generate_raw

    # 字段语义摘要
    semantic_summary = [
        {"name": f.name, "chinese_name": f.chinese_name, "role": f.semantic_role}
        for f in interpretation.fields_semantic
    ]

    system = "你是 DuckDB SQL 专家，只返回纯 SQL，不要任何解释或 markdown。"
    user = f"""为以下图表生成 DuckDB SQL：

数据表: {{table}}（在 SQL 里直接使用 {{table}} 作为表名占位符，不要替换）
图表类型: {spec.type}
图表用途: {spec.purpose}
X轴字段: {spec.x_field}
Y轴字段: {spec.y_field}
分组字段: {spec.group_by or '无'}

字段语义:
{json.dumps(semantic_summary, ensure_ascii=False)}

要求:
- 表名必须用 {{{{table}}}} 占位符（不替换），列名用双引号
- 金额字段用 ROUND(SUM(CAST("字段" AS DOUBLE)), 2) AS 中文别名
- 百分比/比率字段直接 AVG(CAST("字段" AS DOUBLE))
- 时间序列按月聚合: SUBSTR(CAST("时间字段" AS VARCHAR), 1, 7) AS 月份
- 排名类 ORDER BY 值 DESC LIMIT 10
- 饼图返回两列: name, value
- 柱状图返回两列: category, value
- 折线图返回两列: period, value
- 表格返回名称 + 核心指标列（≤6列）
- 只返回 SQL，不要任何说明
"""

    try:
        raw = await _generate_raw(system, user, db)
        sql = raw.strip()
        # 清理 markdown
        fence = re.search(r"```(?:sql)?\s*([\s\S]+?)\s*```", sql)
        if fence:
            sql = fence.group(1).strip()
        # 安全检查：必须是 SELECT
        if not re.match(r"^\s*SELECT\b", sql, re.IGNORECASE):
            return _fallback_chart_sql(spec, table_name)
        # 必须含 {table} 占位符
        if "{table}" not in sql:
            sql = sql.replace(f'"{table_name}"', "{table}").replace(table_name, "{table}")
        return sql
    except Exception:
        return _fallback_chart_sql(spec, table_name)


def _chart_type_to_widget_type(ct: str) -> tuple[str, str]:
    """(widget_type, chart_type) for ChartCard rendering."""
    mapping = {
        "line": ("chart", "line"),
        "bar": ("chart", "bar"),
        "bar_horizontal": ("chart", "bar_horizontal"),
        "pie": ("chart", "pie"),
        "table": ("chart", "table"),
    }
    return mapping.get(ct, ("chart", "bar"))


def _chart_default_width(ct: str) -> int:
    if ct in ("bar_horizontal", "table"):
        return 5
    elif ct in ("line", "bar"):
        return 3
    return 2


# ── Layout ─────────────────────────────────────────────────────────────────────

def _assign_positions(widgets: list[dict]) -> list[dict]:
    """
    简单网格布局：
    - 第0行：KPI 卡片
    - 第1行起：图表，按宽度贪心装箱（6格宽）
    """
    kpis = [w for w in widgets if w["type"] == "kpi"]
    charts = [w for w in widgets if w["type"] == "chart"]

    # KPI 行
    kpi_count = len(kpis)
    if kpi_count:
        kpi_w = max(1, 6 // kpi_count)
        for i, k in enumerate(kpis):
            k["position"] = {"row": 0, "col": i * kpi_w, "width": kpi_w, "height": 1}

    # 图表：贪心装入行（最大宽6）
    row = 1
    col = 0
    for c in charts:
        w = c["position"].get("width", 3)
        if col + w > 6:
            row += 1
            col = 0
        c["position"] = {"row": row, "col": col, "width": w, "height": 1}
        col += w
        if col >= 6:
            row += 1
            col = 0

    return kpis + charts


# ── Main entry ────────────────────────────────────────────────────────────────

async def generate_smart_dashboard(
    dataset,             # Dataset ORM 对象
    interpretation: DataInterpretation,
    db: AsyncSession,
) -> dict:
    """
    基于 AI 理解生成看板 config，返回完整的 config dict。
    """
    table_name = f"dataset_{dataset.id.hex}"
    widgets: list[dict] = []

    # ── KPI 行 ────────────────────────────────────────────────────────────────
    for i, kpi_spec in enumerate(interpretation.recommended_kpis[:4]):
        if not kpi_spec.field:
            continue
        widgets.append(_build_kpi_widget(kpi_spec, i))

    # ── 图表行 ────────────────────────────────────────────────────────────────
    chart_row = 1
    chart_col = 0
    for chart_spec in interpretation.recommended_charts[:5]:
        if not chart_spec.x_field:
            continue

        sql = await _ai_chart_sql(chart_spec, table_name, interpretation, db)
        wtype, chart_type = _chart_type_to_widget_type(chart_spec.type)
        width = _chart_default_width(chart_spec.type)

        widgets.append({
            "id": _uid("chart"),
            "type": wtype,
            "chart_type": chart_type,
            "title": chart_spec.title,
            "query": sql,
            "position": {"row": chart_row, "col": chart_col, "width": width, "height": 1},
        })
        chart_col += width
        if chart_col >= 6:
            chart_row += 1
            chart_col = 0

    # ── 布局优化 ─────────────────────────────────────────────────────────────
    widgets = _assign_positions(widgets)

    # ── Filters（分类字段） ───────────────────────────────────────────────────
    filters = []
    for fp in (interpretation.fields_semantic or []):
        if fp.semantic_role == "dimension" and fp.importance in ("high", "medium"):
            filters.append({
                "id": f"filter_{fp.name}",
                "type": "select",
                "field": fp.name,
                "label": fp.chinese_name or fp.name,
                "options": "auto",
            })
        if len(filters) >= 3:
            break
    if interpretation.time_field:
        filters.insert(0, {
            "id": f"filter_{interpretation.time_field}",
            "type": "select",
            "field": interpretation.time_field,
            "label": "时间",
            "options": "auto",
        })

    return {
        "title": interpretation.business_domain,
        "dataset_id": str(dataset.id),
        "table_name": table_name,
        "filters": filters,
        "widgets": widgets,
        "interpretation": interpretation.to_dict(),
    }


# ── generate_from_plan：根据用户选定角度生成看板 ─────────────────────────────

async def _materialize_widget(
    proposed,   # ProposedWidget
    table_name: str,
    schema_fields: list[dict],
    db: AsyncSession,
    row_idx: int,
    col_idx: int,
) -> dict | None:
    """把 sql_hint 翻译成真实可执行 SQL，构建 widget dict。"""
    from app.services.ai_engine import _generate_raw

    fields_desc = "\n".join(
        f'  - "{f["name"]}" ({f.get("type","string")})' for f in schema_fields
    )
    ct = proposed.chart_type

    system = "你是 DuckDB SQL 专家，只返回纯 SQL，不要任何解释或 markdown。"
    placeholder = "{table}"
    user = f"""为一个 {ct} 类型的看板组件生成 DuckDB SQL。

表名占位符: 必须用字面量 {placeholder} 作为表名，不要替换成任何实际表名或ID。

字段清单:
{fields_desc}

组件标题: {proposed.title}
组件用途: {proposed.purpose}
SQL 思路: {proposed.sql_hint}

规则:
- 表名必须写成 {placeholder}，列名用双引号
- 聚合数值字段: ROUND(SUM(CAST("字段" AS DOUBLE)), 2) AS "中文别名"
- 比率字段: AVG(CAST("字段" AS DOUBLE)) AS "中文别名"
- 思路提到"过滤沉默段/只看有效/排除零值" → 加 WHERE CAST("字段" AS DOUBLE) > 0
- kpi 类: SELECT ... AS value（单值）
- pie: 两列 name, value
- bar/bar_horizontal: 两列 category, value
- line: 两列 period, value
- table: 名称列 + 3-5 个核心指标列
- 排名类: ORDER BY ... DESC LIMIT 10
- 时间序列: SUBSTR(CAST("时间字段" AS VARCHAR),1,7) AS period，ORDER BY period

只返回 SQL，不要任何说明或代码块标记。
"""

    try:
        raw = await _generate_raw(system, user, db)
        sql = raw.strip()
        # 清理 markdown
        fence = re.search(r"```(?:sql)?\s*([\s\S]+?)\s*```", sql)
        if fence:
            sql = fence.group(1).strip()
        sql = sql.rstrip(";")
        # 必须是 SELECT
        if not re.match(r"^\s*SELECT\b", sql, re.IGNORECASE):
            return None
        # 确保含 {table} 占位符，兼容 AI 各种写法
        if "{table}" not in sql:
            # {dataset_uuid} 或 {dataset_hex} 带花括号
            sql = re.sub(r'\{[^}]*dataset_[^}]*\}', "{table}", sql)
        if "{table}" not in sql:
            # "dataset_xxx" 带引号
            sql = re.sub(r'"dataset_[0-9a-fA-F\-]+"', "{table}", sql)
        if "{table}" not in sql:
            # 裸 dataset_xxx 不带引号和花括号
            sql = re.sub(r'dataset_[0-9a-fA-F\-]+', "{table}", sql)
        if "{table}" not in sql:
            return None
    except Exception:
        return None

    # 转换 chart_type → widget type/chart_type
    type_map = {
        "kpi":          ("kpi",   None),
        "line":         ("chart", "line"),
        "bar":          ("chart", "bar"),
        "bar_horizontal": ("chart", "bar_horizontal"),
        "pie":          ("chart", "pie"),
        "table":        ("chart", "table"),
    }
    wtype, chart_type = type_map.get(ct, ("chart", "bar"))

    w: dict = {
        "id": _uid("w"),
        "type": wtype,
        "title": proposed.title,
        "query": sql,
        "position": {"row": row_idx, "col": col_idx, "width": proposed.col_span, "height": 1},
    }
    if chart_type:
        w["chart_type"] = chart_type

    return w


async def _batch_generate_sql(
    widgets_spec: list[dict],
    table_name: str,
    schema_fields: list[dict],
    db: AsyncSession,
) -> list[str | None]:
    """一次 AI 调用生成所有组件的 SQL，返回与 widgets_spec 等长的列表。"""
    from app.services.ai_engine import _generate_raw

    fields_desc = "\n".join(
        f'  - "{f["name"]}" ({f.get("type","string")})' for f in schema_fields
    )
    placeholder = "{table}"

    specs_text = "\n\n".join(
        f'[{i+1}] 标题: {w["title"]}\n'
        f'    类型: {w["chart_type"]}\n'
        f'    用途: {w["purpose"]}\n'
        f'    SQL思路: {w["sql_hint"]}'
        for i, w in enumerate(widgets_spec)
    )

    system = "你是 DuckDB SQL 专家，严格按要求的 JSON 格式返回，不要 markdown。"
    user = f"""为以下 {len(widgets_spec)} 个看板组件各生成一条 DuckDB SQL。

表名占位符: 所有 SQL 的表名必须写成 {placeholder}

字段清单:
{fields_desc}

组件列表:
{specs_text}

SQL 规则:
- 表名用 {placeholder}，列名用双引号
- kpi类: SELECT ... AS value（单值）
- pie: SELECT x AS name, agg(y) AS value FROM {placeholder} GROUP BY x LIMIT 10
- bar/bar_horizontal: SELECT x AS category, agg(y) AS value FROM {placeholder} GROUP BY x ORDER BY value DESC LIMIT 10
- line: SELECT period, agg(y) AS value FROM {placeholder} GROUP BY period ORDER BY period
- table: 名称列 + 3-5 核心指标，LIMIT 20
- 数值用 ROUND(SUM(CAST("字段" AS DOUBLE)), 2)，比率用 AVG(CAST("字段" AS DOUBLE))
- 思路提到"排除零值/只看有效/沉默段" → WHERE CAST("字段" AS DOUBLE) > 0

返回格式（严格 JSON 数组，长度必须等于 {len(widgets_spec)}）:
["SQL1", "SQL2", ...]

只返回 JSON 数组，不要任何说明。"""

    try:
        raw = await _generate_raw(system, user, db, max_tokens_override=3000)
        raw = raw.strip()
        fence = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", raw)
        if fence:
            raw = fence.group(1).strip()
        arr_match = re.search(r"\[[\s\S]+\]", raw)
        if arr_match:
            raw = arr_match.group()
        sql_list: list[str] = json.loads(raw)
        if not isinstance(sql_list, list):
            raise ValueError("not a list")
    except Exception:
        return [None] * len(widgets_spec)

    results: list[str | None] = []
    for sql in sql_list:
        if not isinstance(sql, str):
            results.append(None)
            continue
        sql = sql.strip().rstrip(";")
        fence2 = re.search(r"```(?:sql)?\s*([\s\S]+?)\s*```", sql)
        if fence2:
            sql = fence2.group(1).strip()
        if not re.match(r"^\s*SELECT\b", sql, re.IGNORECASE):
            results.append(None)
            continue
        # 修复占位符
        if "{table}" not in sql:
            sql = re.sub(r'\{[^}]*dataset_[^}]*\}', "{table}", sql)
        if "{table}" not in sql:
            sql = re.sub(r'"dataset_[0-9a-fA-F\-]+"', "{table}", sql)
        if "{table}" not in sql:
            sql = re.sub(r'dataset_[0-9a-fA-F\-]+', "{table}", sql)
        results.append(sql if "{table}" in sql else None)

    # 如果 AI 返回数量不对，补 None
    while len(results) < len(widgets_spec):
        results.append(None)
    return results[:len(widgets_spec)]


async def generate_from_plan(
    dataset,              # Dataset ORM 对象
    plan_dict: dict,      # 前端传回的 plan JSON
    selected_angle_ids: list[str],
    db: AsyncSession,
) -> dict:
    """
    根据用户选定的分析角度，一次 AI 调用批量生成所有 widget SQL，
    组装成标准 dashboard config。
    """
    from app.services.data_analyst import ProposedWidget, AnalysisAngle

    table_name    = f"dataset_{dataset.id.hex}"
    schema_info   = dataset.schema_info or {}
    schema_fields = schema_info.get("columns", [])

    # 重建 plan 对象
    angles = [
        AnalysisAngle(
            id=a["id"],
            title=a["title"],
            business_question=a.get("business_question", ""),
            reasoning=a.get("reasoning", ""),
            is_recommended=a.get("is_recommended", False),
            proposed_widgets=[
                ProposedWidget(
                    title=w["title"],
                    chart_type=w["chart_type"],
                    purpose=w.get("purpose", ""),
                    sql_hint=w.get("sql_hint", ""),
                    col_span=w.get("col_span", 3),
                )
                for w in a.get("proposed_widgets", [])
            ],
        )
        for a in plan_dict.get("angles", [])
    ]

    # 收集选定角度的所有 widgets
    selected: list[ProposedWidget] = []
    for angle in angles:
        if angle.id in selected_angle_ids:
            selected.extend(angle.proposed_widgets)

    if not selected:
        selected_angle_titles = [a.title for a in angles if a.id in selected_angle_ids]
        return {
            "title": f"{dataset.name} 数据看板",
            "dataset_id": str(dataset.id),
            "table_name": table_name,
            "filters": [],
            "widgets": [],
            "interpretation": {"business_domain": plan_dict.get("data_understanding", ""), "key_insights": [], "key_questions": [], "selected_angles": selected_angle_titles},
        }

    # 构造批量请求 spec
    specs = [{"title": pw.title, "chart_type": pw.chart_type, "purpose": pw.purpose, "sql_hint": pw.sql_hint} for pw in selected]

    # 一次 AI 调用生成所有 SQL
    sql_list = await _batch_generate_sql(specs, table_name, schema_fields, db)

    # 组装 widgets，KPI 放首行
    kpi_pws  = [(pw, sql) for pw, sql in zip(selected, sql_list) if pw.chart_type == "kpi" and sql]
    chart_pws = [(pw, sql) for pw, sql in zip(selected, sql_list) if pw.chart_type != "kpi" and sql]

    widgets: list[dict] = []

    # KPI 行（最多4个）
    kpi_count = min(len(kpi_pws), 4)
    kpi_w = max(1, 6 // kpi_count) if kpi_count else 2
    for i, (pw, sql) in enumerate(kpi_pws[:4]):
        widgets.append({"id": _uid("w"), "type": "kpi", "title": pw.title, "query": sql,
                        "position": {"row": 0, "col": i * kpi_w, "width": kpi_w, "height": 1}})

    # 图表行（贪心装填6格）
    row, col = 1, 0
    for pw, sql in chart_pws:
        wtype, chart_type = type_map = {
            "line": ("chart", "line"), "bar": ("chart", "bar"),
            "bar_horizontal": ("chart", "bar_horizontal"),
            "pie": ("chart", "pie"), "table": ("chart", "table"),
        }.get(pw.chart_type, ("chart", "bar"))
        span = pw.col_span
        if col + span > 6:
            row += 1
            col = 0
        w: dict = {"id": _uid("w"), "type": wtype, "title": pw.title, "query": sql,
                   "position": {"row": row, "col": col, "width": span, "height": 1}}
        if chart_type:
            w["chart_type"] = chart_type
        widgets.append(w)
        col += span
        if col >= 6:
            row += 1
            col = 0

    # 筛选器
    filters: list[dict] = []
    for f in schema_fields:
        dc = f.get("distinct_count", 999)
        if f.get("type", "").lower() in ("string", "varchar", "text") and 2 <= dc <= 30:
            filters.append({"id": f"filter_{f['name']}", "type": "select", "field": f["name"], "label": f["name"], "options": "auto"})
        if len(filters) >= 3:
            break

    selected_angle_titles = [a.title for a in angles if a.id in selected_angle_ids]
    return {
        "title": f"{dataset.name} 数据看板",
        "dataset_id": str(dataset.id),
        "table_name": table_name,
        "filters": filters,
        "widgets": widgets,
        "interpretation": {
            "business_domain": plan_dict.get("data_understanding", ""),
            "key_insights": [],
            "key_questions": [],
            "selected_angles": selected_angle_titles,
        },
    }


# ── Legacy sync entry（保留兼容性） ────────────────────────────────────────────

def generate_dashboard_config(
    dataset_name: str,
    dataset_id: str,
    schema,
    table_name: str,
) -> dict:
    """原来的同步模板匹配方式，保留作为 fallback。"""
    from app.schemas.dataset import DatasetSchema as _Schema

    numeric_fields: list[str] = []
    category_fields: list[str] = []
    date_fields: list[str] = []
    text_fields: list[str] = []

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

    if not date_fields:
        for col in schema.columns:
            n = col.name.lower()
            if any(k in n for k in ["月", "日期", "date", "time", "year", "month", "period", "年"]):
                if col.name not in date_fields:
                    date_fields.append(col.name)

    distinct_map = {col.name: (col.distinct_count or 0) for col in schema.columns}
    widgets: list[dict] = []

    for i, nf in enumerate(numeric_fields[:4]):
        widgets.append({
            "id": f"kpi_{i}",
            "type": "kpi",
            "title": nf,
            "position": {"row": 0, "col": i, "width": 1, "height": 1},
            "query": f'SELECT SUM(CAST("{nf}" AS DOUBLE)) AS value FROM {{table}}',
            "format": "number",
        })

    if date_fields and numeric_fields:
        df, nf = date_fields[0], numeric_fields[0]
        dc = distinct_map.get(df, 0)
        date_expr = f'SUBSTR(CAST("{df}" AS VARCHAR), 1, 6)' if dc > 30 else f'CAST("{df}" AS VARCHAR)'
        widgets.append({
            "id": "trend_1",
            "type": "chart",
            "chart_type": "line",
            "title": f"{nf}趋势",
            "position": {"row": 1, "col": 0, "width": 3, "height": 1},
            "query": f'SELECT {date_expr} AS period, SUM(CAST("{nf}" AS DOUBLE)) AS total FROM {{table}} GROUP BY {date_expr} ORDER BY {date_expr} LIMIT 60',
        })

    if category_fields and numeric_fields:
        cf, nf = category_fields[0], numeric_fields[0]
        widgets.append({
            "id": "pie_1",
            "type": "chart",
            "chart_type": "pie",
            "title": f"按{cf}分布",
            "position": {"row": 1, "col": 3, "width": 2, "height": 1},
            "query": f'SELECT "{cf}", SUM(CAST("{nf}" AS DOUBLE)) AS total FROM {{table}} GROUP BY "{cf}" ORDER BY total DESC LIMIT 10',
        })

    if text_fields and numeric_fields:
        tf, nf = text_fields[0], numeric_fields[0]
        widgets.append({
            "id": "ranking_1",
            "type": "chart",
            "chart_type": "bar_horizontal",
            "title": f"{tf} TOP 10",
            "position": {"row": 2, "col": 0, "width": 5, "height": 1},
            "query": f'SELECT "{tf}", SUM(CAST("{nf}" AS DOUBLE)) AS total FROM {{table}} GROUP BY "{tf}" ORDER BY total DESC LIMIT 10',
        })

    filters = []
    if date_fields:
        filters.append({"id": f"filter_{date_fields[0]}", "type": "select", "field": date_fields[0], "label": date_fields[0], "options": "auto"})
    for cf in category_fields[:2]:
        filters.append({"id": f"filter_{cf}", "type": "select", "field": cf, "label": cf, "options": "auto"})

    return {
        "title": f"{dataset_name} 数据看板",
        "dataset_id": dataset_id,
        "table_name": table_name,
        "filters": filters,
        "widgets": widgets,
    }
