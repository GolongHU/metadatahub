from __future__ import annotations

import json
import re
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.schemas.dataset import DatasetSchema
from app.schemas.query import GeneratedSQL

# ── Prompt builders ───────────────────────────────────────────────────────────

def _build_schema_block(table_name: str, schema: DatasetSchema) -> str:
    lines = [f"Table: {table_name}", "Columns:"]
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


def build_system_prompt(table_name: str, schema: DatasetSchema, role: str, scope_desc: str) -> str:
    return _SYSTEM_PROMPT_TEMPLATE.format(
        schema_block=_build_schema_block(table_name, schema),
        role=role,
        scope_desc=scope_desc or "所有数据",
        chart_rules=_CHART_RULES,
    )


# ── JSON extraction ───────────────────────────────────────────────────────────

def _extract_json(text: str) -> dict:
    text = text.strip()
    fence_match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if fence_match:
        text = fence_match.group(1).strip()
    brace_match = re.search(r"\{[\s\S]+\}", text)
    if brace_match:
        text = brace_match.group()
    return json.loads(text)


# ── Dynamic client resolution ─────────────────────────────────────────────────

async def _get_routing(task_type: str, db: AsyncSession):
    """Load routing + provider from DB. Returns (provider, routing) or (None, None)."""
    from app.models.platform import AIProvider, AITaskRouting

    r_result = await db.execute(
        select(AITaskRouting).where(
            AITaskRouting.task_type == task_type,
            AITaskRouting.is_active == True,  # noqa: E712
        )
    )
    routing = r_result.scalar_one_or_none()
    if routing is None or not routing.primary_provider_id:
        return None, None

    p_result = await db.execute(
        select(AIProvider).where(
            AIProvider.id == routing.primary_provider_id,
            AIProvider.is_active == True,  # noqa: E712
        )
    )
    provider = p_result.scalar_one_or_none()
    return provider, routing


async def _get_fallback(routing, db: AsyncSession):
    """Load fallback provider for a routing row."""
    if routing is None or not routing.fallback_provider_id:
        return None
    from app.models.platform import AIProvider
    p_result = await db.execute(
        select(AIProvider).where(
            AIProvider.id == routing.fallback_provider_id,
            AIProvider.is_active == True,  # noqa: E712
        )
    )
    return p_result.scalar_one_or_none()


async def _call_openai_compatible(
    api_key: str,
    base_url: str,
    model: str,
    messages: list[dict],
    temperature: float = 0.1,
    max_tokens: int = 2000,
) -> str:
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key, base_url=base_url)
    response = await client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return response.choices[0].message.content or ""


async def _call_anthropic(
    api_key: str,
    model: str,
    system: str,
    user_content: str,
    temperature: float = 0.1,
    max_tokens: int = 2000,
) -> str:
    from anthropic import AsyncAnthropic
    client = AsyncAnthropic(api_key=api_key)
    response = await client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user_content}],
        temperature=temperature,
    )
    return response.content[0].text


async def _invoke(
    provider,
    routing,
    system_prompt: str,
    user_content: str,
) -> str:
    """Dispatch to the right SDK based on provider_type."""
    from app.services.crypto import decrypt_api_key
    api_key = decrypt_api_key(provider.api_key_encrypted)
    model = routing.primary_model
    temperature = routing.temperature
    max_tokens = routing.max_tokens

    if provider.provider_type == "anthropic":
        return await _call_anthropic(api_key, model, system_prompt, user_content, temperature, max_tokens)
    else:  # openai_compatible
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]
        return await _call_openai_compatible(api_key, provider.base_url, model, messages, temperature, max_tokens)


async def _invoke_fallback(
    fallback_provider,
    routing,
    system_prompt: str,
    user_content: str,
) -> str:
    from app.services.crypto import decrypt_api_key
    api_key = decrypt_api_key(fallback_provider.api_key_encrypted)
    model = routing.fallback_model or ""
    temperature = routing.temperature
    max_tokens = routing.max_tokens

    if fallback_provider.provider_type == "anthropic":
        return await _call_anthropic(api_key, model, system_prompt, user_content, temperature, max_tokens)
    else:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]
        return await _call_openai_compatible(api_key, fallback_provider.base_url, model, messages, temperature, max_tokens)


# ── Fallback to env-var config ────────────────────────────────────────────────

_env_client = None


def _get_env_client():
    global _env_client
    if _env_client is None:
        from openai import AsyncOpenAI
        _env_client = AsyncOpenAI(
            api_key=settings.ai_api_key or settings.anthropic_api_key,
            base_url=settings.ai_base_url or None,
        )
    return _env_client


async def _call_env_provider(system_prompt: str, user_content: str) -> str:
    client = _get_env_client()
    response = await client.chat.completions.create(
        model=settings.ai_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
    )
    return response.choices[0].message.content or ""


# ── Public API ────────────────────────────────────────────────────────────────

async def generate_sql(
    question: str,
    table_name: str,
    schema: DatasetSchema,
    role: str = "admin",
    scope_desc: str = "所有数据",
    error_context: Optional[str] = None,
    db: Optional[AsyncSession] = None,
) -> GeneratedSQL:
    """
    Generate SQL from natural language.
    Uses DB-driven routing when db is provided; falls back to env-var config.
    """
    system_prompt = build_system_prompt(table_name, schema, role, scope_desc)

    user_content = question
    if error_context:
        user_content = (
            f"{question}\n\n"
            f"注意：上次生成的 SQL 执行时报错：{error_context}\n"
            f"请修正 SQL，确保语法正确并只使用表中已有的列名。"
        )

    raw = await _generate_raw(system_prompt, user_content, db)

    # Parse response, retry once if JSON extraction fails
    try:
        parsed = _extract_json(raw)
    except (json.JSONDecodeError, IndexError):
        retry_content = "请只返回纯 JSON，不要包含任何 markdown 标记或额外文字"
        retry_raw = await _generate_raw(system_prompt, retry_content, db,
                                        prior_assistant=raw, prior_user=user_content)
        try:
            parsed = _extract_json(retry_raw)
        except (json.JSONDecodeError, IndexError) as exc:
            raise ValueError(f"AI returned non-JSON response: {retry_raw[:300]}") from exc

    sql = parsed.get("sql", "").strip()
    explanation = parsed.get("explanation", "").strip()
    chart_type = parsed.get("chart_type", "table").strip().lower()

    if not sql:
        raise ValueError(f"AI did not return a SQL field. Raw: {raw[:300]}")

    if chart_type not in {"bar", "line", "pie", "table", "bar_horizontal"}:
        chart_type = "table"

    return GeneratedSQL(sql=sql, explanation=explanation, chart_type=chart_type)


async def _generate_raw(
    system_prompt: str,
    user_content: str,
    db: Optional[AsyncSession],
    prior_assistant: Optional[str] = None,
    prior_user: Optional[str] = None,
) -> str:
    """Call AI with optional DB-driven routing and fallback."""
    provider, routing = (None, None)
    if db is not None:
        try:
            provider, routing = await _get_routing("nl2sql", db)
        except Exception:
            pass

    # DB routing available — try primary, then fallback
    if provider is not None and routing is not None:
        # Build messages with optional prior turn for retry
        effective_user = user_content
        if prior_assistant and prior_user:
            # Simulate a multi-turn by appending the correction
            effective_user = (
                f"{prior_user}\n\n[上次回复]\n{prior_assistant}\n\n{user_content}"
            )
        try:
            return await _invoke(provider, routing, system_prompt, effective_user)
        except Exception as primary_err:
            fallback_provider = await _get_fallback(routing, db)
            if fallback_provider is not None:
                try:
                    return await _invoke_fallback(fallback_provider, routing, system_prompt, effective_user)
                except Exception as fallback_err:
                    raise ValueError(
                        f"Primary error: {primary_err}; Fallback error: {fallback_err}"
                    ) from fallback_err
            raise

    # No DB routing — use env-var config
    effective_user = user_content
    if prior_assistant and prior_user:
        effective_user = (
            f"{prior_user}\n\n[上次回复]\n{prior_assistant}\n\n{user_content}"
        )
    return await _call_env_provider(system_prompt, effective_user)
