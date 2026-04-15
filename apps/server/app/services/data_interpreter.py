"""data_interpreter.py — 调用 AI 读懂数据集的业务含义"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.data_profiler import DataProfile


# ── Output schema ─────────────────────────────────────────────────────────────

@dataclass
class FieldSemantic:
    name: str
    chinese_name: str
    semantic_role: str          # primary_metric | secondary_metric | dimension | identifier | time
    business_meaning: str
    importance: str             # high | medium | low
    format_hint: str            # currency_wan | percent | count | score | text | auto


@dataclass
class KpiSpec:
    title: str
    field: str
    aggregation: str            # sum | avg | count | max | min
    filter: str
    comparison: str             # period_over_period | none
    format: str


@dataclass
class ChartSpec:
    purpose: str
    type: str                   # line | bar | bar_horizontal | pie | table
    x_field: str
    y_field: str
    group_by: str
    title: str


@dataclass
class DataInterpretation:
    business_domain: str
    table_purpose: str
    narrative_mode: str         # time_series | scoring_ranking | categorical_breakdown | mixed
    narrative_reason: str
    key_questions: list[str] = field(default_factory=list)
    key_insights: list[str] = field(default_factory=list)
    fields_semantic: list[FieldSemantic] = field(default_factory=list)
    recommended_kpis: list[KpiSpec] = field(default_factory=list)
    recommended_charts: list[ChartSpec] = field(default_factory=list)
    color_mapping: dict[str, dict[str, str]] = field(default_factory=dict)
    time_field: str | None = None

    def to_dict(self) -> dict:
        return {
            "business_domain": self.business_domain,
            "table_purpose": self.table_purpose,
            "narrative_mode": self.narrative_mode,
            "key_questions": self.key_questions,
            "key_insights": self.key_insights,
        }


# ── Prompt ────────────────────────────────────────────────────────────────────

def _format_fields(profile: DataProfile) -> str:
    lines = []
    for fp in profile.fields:
        extras = []
        if fp.numeric_stats:
            s = fp.numeric_stats
            extras.append(f"范围 {s.get('min_val')} ~ {s.get('max_val')}, 均值 {round(s.get('avg_val') or 0, 2)}")
            if fp.is_likely_amount:
                extras.append("疑似金额字段")
            if fp.is_likely_percent:
                extras.append("疑似百分比字段")
            if fp.is_likely_count:
                extras.append("疑似计数字段")
        if fp.is_categorical and fp.sample_values:
            extras.append(f"分类值: {fp.sample_values[:8]}")
        elif fp.sample_values and not fp.is_categorical:
            extras.append(f"样本: {fp.sample_values[:5]}")
        if fp.date_range:
            extras.append(f"时间范围 {fp.date_range.get('min_date')} ~ {fp.date_range.get('max_date')}")
        extra_str = "  → " + " | ".join(extras) if extras else ""
        lines.append(f'  - "{fp.name}" ({fp.type}, {fp.distinct_count} distinct){extra_str}')
    return "\n".join(lines)


def _format_samples(rows: list[dict]) -> str:
    if not rows:
        return "(无样本数据)"
    keys = list(rows[0].keys())
    header = " | ".join(keys)
    lines = [header, "-" * len(header)]
    for row in rows[:5]:
        lines.append(" | ".join(str(row.get(k, "")) for k in keys))
    return "\n".join(lines)


def _build_prompt(profile: DataProfile, dataset_name: str, sample_rows: list[dict]) -> str:
    return f"""你是一个资深数据分析师。给你一份数据集，请仔细分析并给出结构化的业务理解。

数据集名称: {dataset_name}
总行数: {profile.row_count}

字段统计画像:
{_format_fields(profile)}

前5行样本数据:
{_format_samples(sample_rows)}

请用 JSON 格式返回你的理解。注意:
1. business_domain 要具体（如"合作伙伴月度签约回款数据"，不要说"销售数据"）
2. fields_semantic 必须覆盖所有字段，chinese_name 用简洁的中文业务名
3. recommended_kpis 给出 3-4 个最有价值的 KPI
4. recommended_charts 给出 3-5 个图表，每个回答一个不同的业务问题
5. 如果有时间字段优先选 time_series，有评分/等级字段优先选 scoring_ranking
6. 如果有明显的状态/等级字段，在 color_mapping 里给出语义颜色

返回格式（严格 JSON，不含 markdown）:
{{
  "business_domain": "具体的业务描述",
  "table_purpose": "这张表的核心用途",
  "narrative_mode": "time_series | scoring_ranking | categorical_breakdown | mixed",
  "narrative_reason": "选择这个叙事模式的原因",
  "key_questions": ["这份数据能回答的3-5个核心业务问题"],
  "key_insights": ["从样本数据已能看出的2-3个初步洞察"],
  "fields_semantic": [
    {{
      "name": "原字段名",
      "chinese_name": "中文业务名",
      "semantic_role": "primary_metric | secondary_metric | dimension | identifier | time",
      "business_meaning": "业务含义一句话",
      "importance": "high | medium | low",
      "format_hint": "currency_wan | percent | count | score | text | auto"
    }}
  ],
  "recommended_kpis": [
    {{
      "title": "KPI中文标题",
      "field": "字段名",
      "aggregation": "sum | avg | count | max | min",
      "filter": "",
      "comparison": "none",
      "format": "currency_wan | percent | count | auto"
    }}
  ],
  "recommended_charts": [
    {{
      "purpose": "这个图表回答什么问题",
      "type": "line | bar | bar_horizontal | pie | table",
      "x_field": "X轴字段名",
      "y_field": "Y轴字段名",
      "group_by": "",
      "title": "中文图表标题"
    }}
  ],
  "color_mapping": {{
    "字段名": {{
      "值": "#颜色hex"
    }}
  }}
}}"""


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


def _parse(raw: dict, profile: DataProfile) -> DataInterpretation:
    fields_semantic = [
        FieldSemantic(
            name=f.get("name", ""),
            chinese_name=f.get("chinese_name", f.get("name", "")),
            semantic_role=f.get("semantic_role", "dimension"),
            business_meaning=f.get("business_meaning", ""),
            importance=f.get("importance", "medium"),
            format_hint=f.get("format_hint", "auto"),
        )
        for f in raw.get("fields_semantic", [])
    ]

    kpis = [
        KpiSpec(
            title=k.get("title", ""),
            field=k.get("field", ""),
            aggregation=k.get("aggregation", "sum"),
            filter=k.get("filter", ""),
            comparison=k.get("comparison", "none"),
            format=k.get("format", "auto"),
        )
        for k in raw.get("recommended_kpis", [])
    ]

    charts = [
        ChartSpec(
            purpose=c.get("purpose", ""),
            type=c.get("type", "bar"),
            x_field=c.get("x_field", ""),
            y_field=c.get("y_field", ""),
            group_by=c.get("group_by", ""),
            title=c.get("title", ""),
        )
        for c in raw.get("recommended_charts", [])
    ]

    return DataInterpretation(
        business_domain=raw.get("business_domain", ""),
        table_purpose=raw.get("table_purpose", ""),
        narrative_mode=raw.get("narrative_mode", "mixed"),
        narrative_reason=raw.get("narrative_reason", ""),
        key_questions=raw.get("key_questions", []),
        key_insights=raw.get("key_insights", []),
        fields_semantic=fields_semantic,
        recommended_kpis=kpis,
        recommended_charts=charts,
        color_mapping=raw.get("color_mapping", {}),
        time_field=profile.time_field,
    )


# ── Public API ────────────────────────────────────────────────────────────────

async def interpret_dataset(
    profile: DataProfile,
    dataset_name: str,
    sample_rows: list[dict],
    db: AsyncSession,
) -> DataInterpretation:
    """调用 AI 理解数据集，返回结构化的业务解读。"""
    from app.services.ai_engine import _generate_raw

    system = (
        "你是一个资深数据分析师，精通从数据字段推断业务含义。"
        "严格按用户要求的 JSON 格式返回，不要包含任何 markdown 代码块或额外解释。"
    )
    user = _build_prompt(profile, dataset_name, sample_rows)

    raw_text = await _generate_raw(system, user, db)

    try:
        raw_dict = _extract_json(raw_text)
    except Exception:
        # 重试一次
        retry_text = await _generate_raw(
            system,
            "请只返回纯 JSON，不要任何 markdown 或说明文字",
            db,
            prior_assistant=raw_text,
            prior_user=user,
        )
        raw_dict = _extract_json(retry_text)

    return _parse(raw_dict, profile)
