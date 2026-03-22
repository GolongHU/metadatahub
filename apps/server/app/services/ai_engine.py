from __future__ import annotations

import json
import re
from typing import List

from openai import AsyncOpenAI

from app.config import settings
from app.schemas.dataset import DatasetSchema
from app.schemas.query import GeneratedSQL

# ── Prompt builders ───────────────────────────────────────────────────────────

def _build_schema_block(table_name: str, schema: DatasetSchema) -> str:
    """Format dataset schema into a concise SQL-friendly description."""
    lines = [f"Table: {table_name}"]
    lines.append("Columns:")
    for col in schema.columns:
        extras: List[str] = []
        if col.sample_values:
            samples = ", ".join(str(v) for v in col.sample_values[:5])
            extras.append(f"samples: [{samples}]")
        if col.min_value is not None and col.max_value is not None:
            extras.append(f"range: {col.min_value} ~ {col.max_value}")
        if col.distinct_count:
            extras.append(f"{col.distinct_count} distinct values")
        extra_str = "  # " + " | ".join(extras) if extras else ""
        lines.append(f"  - {col.name} ({col.type}): {col.description}{extra_str}")
    return "\n".join(lines)


_CHART_RULES = """
Chart type selection rules:
- "bar"  → comparisons across categories (e.g. revenue by region)
- "line" → trends over time (e.g. monthly deal count)
- "pie"  → part-of-whole with ≤ 8 slices (e.g. revenue share by tier)
- "table" → multi-column detail or when no visual encoding is natural
""".strip()


_SYSTEM_PROMPT_TEMPLATE = """\
你是一个 SQL 生成助手，为 MetadataHub 分析平台（使用 DuckDB）工作。
根据用户的自然语言问题，生成 DuckDB 兼容的 SELECT 查询。

{schema_block}

用户上下文：
- 角色: {role}
- 当前用户的数据可见范围: {scope_desc}

请根据数据可见范围来组织回答的措辞。
例如：若用户只能看华东区数据，说明时请说"华东区"而非"全国"；
若只能看某一合作伙伴数据，说明时请只提及该伙伴。
你不需要在 SQL 中添加权限过滤条件，系统会自动处理行级过滤。

规则：
1. 只生成 SELECT 语句，不要生成 DDL、DML、UNION、注释(--)或分号。
2. 使用上面显示的确切表名（包括 "dataset_" 前缀）。
3. DuckDB 中所有列均以 VARCHAR 存储。需要聚合时请 CAST 为 DOUBLE/INTEGER。
4. 保持 SQL 简洁，符合 DuckDB 语法。
5. 不要添加任何 WHERE 权限过滤条件，系统会自动处理。

{chart_rules}

你必须只返回一个 JSON 对象，不要包含 markdown 代码块或额外文字：
{{"sql": "<DuckDB SELECT 语句>", "explanation": "<一句中文说明查询做了什么>", "chart_type": "<bar|line|pie|table>"}}
"""


def build_system_prompt(
    table_name: str,
    schema: DatasetSchema,
    role: str,
    scope_desc: str,
) -> str:
    return _SYSTEM_PROMPT_TEMPLATE.format(
        schema_block=_build_schema_block(table_name, schema),
        role=role,
        scope_desc=scope_desc or "所有数据",
        chart_rules=_CHART_RULES,
    )


# ── OpenAI-compatible client (Kimi / any provider) ────────────────────────────

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key=settings.ai_api_key or settings.anthropic_api_key,
            base_url=settings.ai_base_url or None,
        )
    return _client


def _extract_json(text: str) -> dict:
    """Extract JSON from model response, stripping any accidental markdown."""
    text = text.strip()
    fence_match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if fence_match:
        text = fence_match.group(1).strip()
    brace_match = re.search(r"\{[\s\S]+\}", text)
    if brace_match:
        text = brace_match.group()
    return json.loads(text)


async def generate_sql(
    question: str,
    table_name: str,
    schema: DatasetSchema,
    role: str = "admin",
    scope_desc: str = "所有数据",
    error_context: str | None = None,
) -> GeneratedSQL:
    """
    Call Kimi (OpenAI-compatible) API to generate SQL from a natural language question.
    Pass error_context to ask the AI to fix a previously failed SQL.
    Returns GeneratedSQL with sql, explanation, chart_type.
    """
    system_prompt = build_system_prompt(table_name, schema, role, scope_desc)
    client = _get_client()

    user_content = question
    if error_context:
        user_content = (
            f"{question}\n\n"
            f"注意：上次生成的 SQL 执行时报错：{error_context}\n"
            f"请修正 SQL，确保语法正确并只使用表中已有的列名。"
        )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]

    response = await client.chat.completions.create(
        model=settings.ai_model,
        messages=messages,
    )
    raw = response.choices[0].message.content or ""

    try:
        parsed = _extract_json(raw)
    except (json.JSONDecodeError, IndexError):
        # Retry once asking for pure JSON
        messages.append({"role": "assistant", "content": raw})
        messages.append({
            "role": "user",
            "content": "请只返回纯 JSON，不要包含任何 markdown 标记或额外文字",
        })
        retry = await client.chat.completions.create(
            model=settings.ai_model,
            messages=messages,
        )
        raw = retry.choices[0].message.content or ""
        try:
            parsed = _extract_json(raw)
        except (json.JSONDecodeError, IndexError) as exc:
            raise ValueError(f"AI returned non-JSON response: {raw[:300]}") from exc

    sql = parsed.get("sql", "").strip()
    explanation = parsed.get("explanation", "").strip()
    chart_type = parsed.get("chart_type", "table").strip().lower()

    if not sql:
        raise ValueError(f"AI did not return a SQL field. Raw: {raw[:300]}")

    if chart_type not in {"bar", "line", "pie", "table"}:
        chart_type = "table"

    return GeneratedSQL(sql=sql, explanation=explanation, chart_type=chart_type)
