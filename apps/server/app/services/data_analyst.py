"""data_analyst.py — AI 数据分析师：输出分析方案，不直接生成看板"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.data_profiler import DataProfile


# ── Output schema ─────────────────────────────────────────────────────────────

@dataclass
class ProposedWidget:
    title: str
    chart_type: str     # kpi | line | bar | bar_horizontal | pie | table
    purpose: str
    sql_hint: str
    col_span: int = 3


@dataclass
class AnalysisAngle:
    id: str
    title: str
    business_question: str
    reasoning: str
    is_recommended: bool
    proposed_widgets: list[ProposedWidget] = field(default_factory=list)


@dataclass
class AnalysisPlan:
    data_understanding: str
    angles: list[AnalysisAngle] = field(default_factory=list)


# ── Prompt ────────────────────────────────────────────────────────────────────

def _format_fields(profile: DataProfile) -> str:
    lines = []
    for f in profile.fields:
        tags = []
        if f.is_categorical:        tags.append(f"分类({f.distinct_count}类)")
        elif f.is_identifier:       tags.append("标识符")
        elif f.is_likely_amount:    tags.append("金额")
        elif f.is_likely_percent:   tags.append("比率")
        elif f.is_likely_count:     tags.append("计数")
        elif f.date_range:          tags.append("时间")
        if f.null_ratio > 0.3:      tags.append(f"空值率{f.null_ratio*100:.0f}%")
        if f.zero_ratio > 0.3:      tags.append(f"零值率{f.zero_ratio*100:.0f}%")
        tag_str = " [" + " | ".join(tags) + "]" if tags else ""
        lines.append(f'  - "{f.name}" ({f.type}){tag_str}')
    return "\n".join(lines)


def _format_samples(rows: list[dict]) -> str:
    if not rows:
        return "  (无样本)"
    lines = []
    for i, row in enumerate(rows[:5]):
        pairs = ", ".join(
            f"{k}={v}" for k, v in row.items() if v is not None
        )[:200]
        lines.append(f"  {i+1}. {pairs}")
    return "\n".join(lines)


def _build_prompt(
    profile: DataProfile,
    dataset_name: str,
    sample_rows: list[dict],
    followup: str | None,
    previous_plan: dict | None,
) -> str:
    findings_text = "\n".join(f"  · {f}" for f in profile.notable_findings)
    fields_text   = _format_fields(profile)
    samples_text  = _format_samples(sample_rows)

    followup_section = ""
    if followup and previous_plan:
        followup_section = f"""

⚠ 用户追问后的精修模式。
之前方案摘要: {json.dumps(previous_plan, ensure_ascii=False)[:1200]}
用户追问: "{followup}"

根据追问调整方案：保留用户未否定的角度，按追问增加/修改角度或 widget。
"""

    return f"""你是一个资深数据分析师，正在为业务方分析一份数据集。
不要急着画图，先理解数据，然后像人类分析师一样提出分析角度。

# 数据集基本情况
名称: {dataset_name}

统计发现:
{findings_text}

字段清单:
{fields_text}

样本行:
{samples_text}
{followup_section}

# 你的任务

像分析师一样思考：
1. 这份数据本质是什么业务场景？
2. 业务方拿到这份数据，最该问的核心问题是什么？
3. 数据中有没有"陷阱"（沉默段、空值、异常）？这些该怎么处理？
4. 哪些维度交叉最能产生洞察？

然后推荐 3-4 个分析角度，每个角度清晰回答一个具体业务问题。

# 输出格式（严格 JSON，不含 markdown）

{{
  "data_understanding": "用 3-5 句话向业务方解释这份数据。要包含：业务背景、规模、关键事实（沉默段/空值/风险）、最有价值的分析维度。语气像分析师在给业务方汇报，不要堆砌字段名。",
  "angles": [
    {{
      "id": "英文唯一id如 risk_monitoring",
      "title": "中文角度名如「逾期风险监控」",
      "business_question": "这个角度回答什么业务问题（一句话）",
      "reasoning": "为什么这个角度对这份数据特别重要（一句话）",
      "is_recommended": true,
      "proposed_widgets": [
        {{
          "title": "中文 widget 标题",
          "chart_type": "kpi | line | bar | bar_horizontal | pie | table",
          "purpose": "这个 widget 回答什么具体小问题",
          "sql_hint": "自然语言描述 SQL 思路：选哪些字段、用什么聚合、是否排除沉默段、是否分组排序、是否限 TOP N",
          "col_span": 2
        }}
      ]
    }}
  ]
}}

# 关键要求

1. data_understanding 必须具体，基于真实数据特征，不要写空话
2. 推荐 3-4 个角度，前 2 个标 is_recommended=true
3. 每个角度 2-3 个 widgets
4. 如果有沉默段，至少有一个角度处理"沉默 vs 活跃"的问题
5. sql_hint 明确说明是否过滤零值/空值（"只统计有效记录"）
6. KPI widget: col_span=2；图表: col_span=3 或 4；横向柱/表格: col_span=6
7. 优先用"责任归属型"维度（如负责人、大区），而不是数据质量差的等级字段
8. 不要机械输出"TOP 10"，要思考"按什么最能回答业务问题"

只输出 JSON，不要任何前后说明。
"""


# ── Parser ────────────────────────────────────────────────────────────────────

def _extract_json(text: str) -> dict:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if fence:
        text = fence.group(1).strip()
    brace = re.search(r"\{[\s\S]+\}", text)
    if brace:
        text = brace.group()
    return json.loads(text)


def _parse(raw: dict) -> AnalysisPlan:
    angles = []
    for a in raw.get("angles", []):
        widgets = [
            ProposedWidget(
                title=w.get("title", ""),
                chart_type=w.get("chart_type", "bar"),
                purpose=w.get("purpose", ""),
                sql_hint=w.get("sql_hint", ""),
                col_span=w.get("col_span", 3),
            )
            for w in a.get("proposed_widgets", [])
        ]
        angles.append(AnalysisAngle(
            id=a.get("id", f"angle_{len(angles)}"),
            title=a.get("title", ""),
            business_question=a.get("business_question", ""),
            reasoning=a.get("reasoning", ""),
            is_recommended=a.get("is_recommended", False),
            proposed_widgets=widgets,
        ))
    return AnalysisPlan(
        data_understanding=raw.get("data_understanding", ""),
        angles=angles,
    )


# ── Public API ────────────────────────────────────────────────────────────────

async def propose_analysis(
    profile: DataProfile,
    dataset_name: str,
    sample_rows: list[dict],
    db: AsyncSession,
    user_followup: str | None = None,
    previous_plan: dict | None = None,
) -> AnalysisPlan:
    from app.services.ai_engine import _generate_raw

    system = (
        "你是一个资深数据分析师，擅长从数据集推断业务含义并提出有价值的分析角度。"
        "严格按要求的 JSON 格式返回，不要包含任何 markdown 代码块或额外文字。"
    )
    user = _build_prompt(profile, dataset_name, sample_rows, user_followup, previous_plan)

    raw_text = await _generate_raw(system, user, db, max_tokens_override=4000)

    try:
        raw_dict = _extract_json(raw_text)
    except Exception:
        retry = await _generate_raw(
            system,
            "请只返回纯 JSON，不要任何 markdown 或说明文字",
            db,
            prior_assistant=raw_text,
            prior_user=user,
            max_tokens_override=4000,
        )
        raw_dict = _extract_json(retry)

    return _parse(raw_dict)
