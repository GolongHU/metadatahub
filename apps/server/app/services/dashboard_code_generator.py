"""dashboard_code_generator.py — AI 直接生成 HTML/ECharts 看板代码"""
from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


# ── Design system ─────────────────────────────────────────────────────────────

DEFAULT_DESIGN_SYSTEM = """
风格: 简洁扁平，白色/半透明卡片，大留白。
主色: #7F77DD / #AFA9EC（紫色系）
危险: #E24B4A  警告: #BA7517  正常: #1D9E75
布局: CSS Grid，6列系统，gap 12px
卡片: background var(--bg-card); border-radius 10px; padding 14px 16px
KPI: 标签 11px color var(--text-secondary) + 数值 22px font-weight 500 color var(--text-primary)
图表: ECharts 5.x，简约风格
字体: var(--font-sans)
"""

HTML_WRAPPER_STYLE = """
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  width: 100%;
  min-width: 0;
}
body {
  font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
  background: transparent;
  color: var(--text-primary, #1A1D2E);
  padding: 12px;
}
:root {
  --text-primary: #1A1D2E;
  --text-secondary: #5F6B7A;
  --text-muted: #9CA3B4;
  --bg-card: rgba(255,255,255,0.72);
  --bg-card-hover: rgba(255,255,255,0.88);
  --border: rgba(108,92,231,0.08);
  --accent: #7F77DD;
  --danger: #E24B4A;
  --warning: #BA7517;
  --success: #1D9E75;
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --text-primary: #E8ECF3;
    --text-secondary: #9CA3B4;
    --text-muted: #5F6B7A;
    --bg-card: rgba(26,29,46,0.55);
    --bg-card-hover: rgba(42,37,80,0.45);
    --border: rgba(162,155,254,0.08);
  }
}
.dashboard-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; padding: 0; width: 100%; }
.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.card-title { font-size: 12px; font-weight: 500; color: var(--text-secondary); margin-bottom: 10px; }
.kpi-label { font-size: 11px; color: var(--text-secondary); margin-bottom: 4px; }
.kpi-value { font-size: 22px; font-weight: 500; color: var(--text-primary); line-height: 1.2; }
.kpi-note { font-size: 10px; margin-top: 4px; }
.note-danger { color: var(--danger); }
.note-warning { color: var(--warning); }
.note-success { color: var(--success); }
.insight-bar {
  grid-column: span 6;
  padding: 10px 14px;
  border-left: 3px solid var(--accent);
  background: rgba(127,119,221,0.06);
  border-radius: 0 8px 8px 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}
.chart-container { width: 100%; }
"""

ECHARTS_THEME = """
const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
const ECHARTS_THEME = {
  textColor: isDark ? '#B4B2A9' : '#5F5E5A',
  splitLineColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
  bgColor: 'transparent',
};
const PALETTE = ['#7F77DD','#60A5FA','#34D399','#FBBF24','#F472B6','#2DD4BF','#A78BFA','#FB923C'];
"""


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class PlannedQuery:
    id: str
    purpose: str
    sql: str
    chart_type: str = "bar"


@dataclass
class QueryResult:
    id: str
    purpose: str
    chart_type: str
    columns: list[str] = field(default_factory=list)
    data: list[dict] = field(default_factory=list)
    error: Optional[str] = None


@dataclass
class GeneratedDashboard:
    html_code: str
    name: str
    skill_id: Optional[str] = None
    queries_executed: int = 0


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_json_list(text: str) -> list:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if fence:
        text = fence.group(1).strip()
    bracket = re.search(r"\[[\s\S]+\]", text)
    if bracket:
        text = bracket.group()
    return json.loads(text)


def _sanitize_html(html: str) -> str:
    """Block dangerous patterns in AI-generated HTML."""
    html = re.sub(r'<\s*iframe', '<!-- blocked-iframe', html, flags=re.I)
    html = re.sub(r'<\s*object', '<!-- blocked-object', html, flags=re.I)
    html = re.sub(r'<\s*embed', '<!-- blocked-embed', html, flags=re.I)
    html = re.sub(r'<\s*form', '<!-- blocked-form', html, flags=re.I)
    # Block network calls (sandbox=allow-scripts already blocks fetch in most
    # browsers, but sanitise as defence-in-depth)
    html = re.sub(r'\bfetch\s*\(', '/* blocked */void(', html)
    html = re.sub(r'\bXMLHttpRequest\b', '/* blocked */', html)
    html = re.sub(r'\blocalStorage\b', '/* blocked */', html)
    html = re.sub(r'\bsessionStorage\b', '/* blocked */', html)
    # Only allow ECharts CDN scripts
    def _block_external_scripts(m: re.Match) -> str:
        tag = m.group(0)
        if 'echarts' in tag.lower():
            return tag
        if 'src=' not in tag.lower():
            return tag  # inline script, keep
        return '<!-- blocked-script -->'
    html = re.sub(r'<script[^>]*>', _block_external_scripts, html, flags=re.I)
    return html


# ── Main generator ─────────────────────────────────────────────────────────────

async def generate_code_dashboard(
    dataset_id: str,
    table_name: str,
    intent: str,
    profile,          # DataProfile from data_profiler
    sample_rows: list[dict],
    db: AsyncSession,
    skill_id: Optional[str] = None,
) -> GeneratedDashboard:
    """
    Two-step AI pipeline:
      1. AI plans SQL queries
      2. Execute queries in parallel
      3. AI generates HTML + ECharts code from results
    """
    from app.services.ai_engine import _generate_raw

    # Load skill if specified or match by intent/profile
    skill = None
    if skill_id:
        skill = await _load_skill(skill_id, db)
    if skill is None:
        skill = await _match_skill(intent, profile, db)

    # Step 1: Plan queries
    queries = await _plan_queries(intent, profile, sample_rows, skill, db)

    # Step 2: Execute in parallel
    results = await _execute_queries(queries, table_name)

    # Step 3: Generate HTML
    html_code = await _generate_html(intent, profile, results, skill, db)
    html_code = _sanitize_html(html_code)

    dashboard_name = _make_name(intent, profile)

    return GeneratedDashboard(
        html_code=html_code,
        name=dashboard_name,
        skill_id=skill.id if skill else None,
        queries_executed=len(results),
    )


# ── Step 1: Query planning ─────────────────────────────────────────────────────

async def _plan_queries(
    intent: str,
    profile,
    sample_rows: list[dict],
    skill,
    db: AsyncSession,
) -> list[PlannedQuery]:
    from app.services.ai_engine import _generate_raw
    from app.services.data_analyst import _format_fields, _format_samples

    skill_hint = ""
    if skill:
        skill_hint = f"\n分析重点 (来自「{skill.name}」模板): {skill.analysis_prompt or ''}\n"

    system = (
        "你是一个数据分析师。根据数据集信息，规划完成看板所需的 SQL 查询。"
        "只返回 JSON 数组，不要任何说明文字或 markdown。"
    )
    user = f"""用户意图: {intent}
{skill_hint}
字段清单:
{_format_fields(profile)}

样本数据:
{_format_samples(sample_rows)}

请规划 5-8 个 SQL 查询，每个查询服务于看板中的一个图表或 KPI。

返回 JSON 数组:
[
  {{
    "id": "q1",
    "purpose": "总合作伙伴数",
    "sql": "SELECT COUNT(*) AS value FROM {{{{table}}}}",
    "chart_type": "kpi"
  }},
  {{
    "id": "q2",
    "purpose": "各大区逾期金额 TOP 10",
    "sql": "SELECT \\"区域\\" AS name, ROUND(SUM(CAST(\\"逾期金额\\" AS DOUBLE)),0) AS value FROM {{{{table}}}} WHERE CAST(\\"逾期金额\\" AS DOUBLE)>0 GROUP BY \\"区域\\" ORDER BY value DESC LIMIT 10",
    "chart_type": "bar_horizontal"
  }}
]

chart_type 可选: kpi | bar | bar_horizontal | line | pie | table
要求:
- 表名用 {{{{table}}}} 占位符
- 列名用双引号，如 \\"列名\\"
- 金额用 ROUND + CAST AS DOUBLE
- 过滤无效数据（WHERE 条件过滤零值/空值）
- 排名类用 bar_horizontal
- 时间趋势用 line
- KPI 用 SELECT ... AS value（单值）
- 最多 8 个查询
"""

    raw = await _generate_raw(system, user, db, max_tokens_override=2000)

    try:
        items = _extract_json_list(raw)
    except Exception:
        # Retry once
        retry = await _generate_raw(
            system,
            "只返回纯 JSON 数组，不要 markdown 或说明",
            db,
            prior_assistant=raw,
            prior_user=user,
            max_tokens_override=2000,
        )
        items = _extract_json_list(retry)

    return [
        PlannedQuery(
            id=q.get("id", f"q{i}"),
            purpose=q.get("purpose", ""),
            sql=q.get("sql", ""),
            chart_type=q.get("chart_type", "bar"),
        )
        for i, q in enumerate(items)
        if q.get("sql")
    ]


# ── Step 2: Execute queries ────────────────────────────────────────────────────

async def _execute_queries(
    queries: list[PlannedQuery],
    table_name: str,
) -> list[QueryResult]:
    from app.database import get_duckdb
    from concurrent.futures import ThreadPoolExecutor
    import asyncio

    loop = asyncio.get_event_loop()

    def _run_one(q: PlannedQuery) -> QueryResult:
        sql = q.sql.replace("{table}", f'"{table_name}"')
        # Basic safety: only SELECT
        sql_stripped = sql.strip().upper()
        if not sql_stripped.startswith("SELECT") or any(
            kw in sql_stripped for kw in ("DROP", "DELETE", "UPDATE", "INSERT", "CREATE", "ALTER", "EXEC")
        ):
            return QueryResult(id=q.id, purpose=q.purpose, chart_type=q.chart_type, error="SQL 安全检查未通过")
        try:
            conn = get_duckdb()
            rows = conn.execute(sql).fetchall()
            col_names = [d[0] for d in conn.execute(sql).description] if rows else []
            # Re-execute to get description + rows together
            result = conn.execute(sql)
            col_names = [d[0] for d in result.description]
            rows = result.fetchall()
            data = [dict(zip(col_names, row)) for row in rows]
            return QueryResult(
                id=q.id, purpose=q.purpose, chart_type=q.chart_type,
                columns=col_names, data=data,
            )
        except Exception as e:
            return QueryResult(id=q.id, purpose=q.purpose, chart_type=q.chart_type, error=str(e))

    with ThreadPoolExecutor(max_workers=4) as pool:
        futs = [loop.run_in_executor(pool, _run_one, q) for q in queries]
        results = await asyncio.gather(*futs, return_exceptions=True)

    return [
        r if isinstance(r, QueryResult)
        else QueryResult(id="err", purpose="error", chart_type="kpi", error=str(r))
        for r in results
    ]


# ── Step 3: Generate HTML ──────────────────────────────────────────────────────

async def _generate_html(
    intent: str,
    profile,
    results: list[QueryResult],
    skill,
    db: AsyncSession,
) -> str:
    from app.services.ai_engine import _generate_raw

    skill_design = skill.design_notes if (skill and skill.design_notes) else DEFAULT_DESIGN_SYSTEM

    system = f"""你是一个前端可视化专家，直接生成可运行的 HTML 看板代码。

设计规范:
{skill_design}

CSS 样式（已提供，直接使用这些 class）:
.dashboard-grid — 6列 CSS Grid 容器
.card — 卡片（border-radius 10px, 半透明背景）
.card-title — 图表标题 12px
.kpi-label — KPI 标签 11px
.kpi-value — KPI 数值 22px 500
.kpi-note .note-danger .note-warning .note-success — KPI 注释行
.insight-bar — AI 洞察条（span 6列，紫色左边框）
.chart-container — ECharts 挂载容器

ECharts 全局变量已注入（无需 import）:
- echarts — ECharts 5 实例
- isDark — 当前是否暗色模式（boolean）
- ECHARTS_THEME.textColor / .splitLineColor — 适配暗色模式的颜色
- PALETTE — 8色调色板数组

技术约束:
- 只输出 <div> + <style> + <script> 片段，不要 DOCTYPE/html/head/body
- 数据内联为 JS const 变量，不要 fetch
- 每个 ECharts 图表 init 后监听 window resize
- KPI 卡片不用 ECharts，直接用 DOM 渲染
- 图表 div 需要设置 height（如 style="height:220px"）
- 必须在最外层包一个 <div class="dashboard-grid"> … </div>（整个看板就是这个网格）
- 网格项 col-span 用 style="grid-column: span N"，N 在 1-6 之间
"""

    # Format query results for AI
    data_context = ""
    for r in results:
        if r.error:
            data_context += f"\n[{r.purpose}] 查询失败: {r.error}\n"
            continue
        data_context += f"\n[{r.purpose}] 类型:{r.chart_type} 列:{r.columns}\n"
        rows_to_show = r.data[:30]
        data_context += json.dumps(rows_to_show, ensure_ascii=False, default=str)
        if len(r.data) > 30:
            data_context += f"\n...共{len(r.data)}行\n"
        data_context += "\n"

    user = f"""用户意图: {intent}

查询结果:
{data_context}

请生成完整的看板 HTML 片段，包含:
1. 顶部 insight-bar（用1句话说最重要的发现，基于真实数据）
2. KPI 卡片行（col-span 1 或 2，3-5个，显示关键数值）
3. 图表区（用真实数据，不要用示例数据）

要求:
- 所有数据来自上面的查询结果，直接写入 JS const 变量
- 跳过查询失败的项
- bar_horizontal 用 ECharts 横向柱状图（xAxis type:'value', yAxis type:'category'）
- 图表 resize 监听: window.addEventListener('resize',()=>chart.resize())
- KPI 中的注释（.kpi-note）用数据推断颜色（高逾期率=danger，低=success）
- 只返回 HTML 代码，不要 markdown，不要解释
"""

    raw = await _generate_raw(system, user, db, max_tokens_override=6000)

    # Strip markdown fences
    raw = raw.strip()
    for fence in ("```html", "```HTML", "```"):
        if raw.startswith(fence):
            raw = raw[len(fence):]
            break
    if raw.endswith("```"):
        raw = raw[:-3]

    return raw.strip()


# ── Skill loading / matching ───────────────────────────────────────────────────

async def _load_skill(skill_id: str, db: AsyncSession):
    from app.models.dashboard import DashboardSkill
    result = await db.execute(
        select(DashboardSkill).where(
            DashboardSkill.id == skill_id,
            DashboardSkill.is_active == True,  # noqa: E712
        )
    )
    return result.scalar_one_or_none()


async def _match_skill(intent: str, profile, db: AsyncSession):
    from app.models.dashboard import DashboardSkill
    result = await db.execute(
        select(DashboardSkill).where(DashboardSkill.is_active == True)  # noqa: E712
        .order_by(DashboardSkill.sort_order)
    )
    skills = result.scalars().all()

    # Keyword match on intent
    intent_lower = intent.lower()
    for skill in skills:
        if skill.trigger_keywords:
            for kw in skill.trigger_keywords:
                if kw.lower() in intent_lower:
                    return skill

    # Field-name match
    if profile and hasattr(profile, "fields"):
        field_names = " ".join(f.name for f in profile.fields).lower()
        for skill in skills:
            if skill.category == "health" and any(k in field_names for k in ["逾期", "回款", "健康"]):
                return skill
            if skill.category == "sales" and any(k in field_names for k in ["签约", "销售", "营收"]):
                return skill
            if skill.category == "scoring" and any(k in field_names for k in ["得分", "评分", "score", "pri"]):
                return skill

    return None


# ── Utilities ─────────────────────────────────────────────────────────────────

def _make_name(intent: str, profile) -> str:
    if intent and len(intent) <= 20:
        return intent
    if intent:
        return intent[:20] + "…"
    if profile and hasattr(profile, "table_name"):
        return f"{profile.table_name} 分析看板"
    return "AI 生成看板"


def build_iframe_html(fragment: str) -> str:
    """Wrap the AI-generated fragment in a full HTML document for iframe rendering."""
    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
{HTML_WRAPPER_STYLE}
</style>
<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
<script>
{ECHARTS_THEME}
</script>
</head>
<body>
{fragment}
<script>
// Auto-resize all ECharts instances on window resize
window.addEventListener('resize', function() {{
  echarts.getInstanceByDom && document.querySelectorAll('[_echarts_instance_]').forEach(function(el) {{
    var inst = echarts.getInstanceByDom(el);
    if (inst) inst.resize();
  }});
}});
// Report content height to parent for iframe auto-height
function reportHeight() {{
  var h = document.body.scrollHeight;
  window.parent && window.parent.postMessage({{ type: 'iframe-height', height: h }}, '*');
}}
setTimeout(reportHeight, 800);
window.addEventListener('resize', reportHeight);
</script>
</body>
</html>"""
