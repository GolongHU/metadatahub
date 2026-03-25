"""platform_config: add platform_config, ai_providers, ai_task_routing tables

Revision ID: 0005
Revises: 0004
Create Date: 2026-03-23
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── platform_config ───────────────────────────────────────────────────────
    op.create_table(
        "platform_config",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("key", sa.String(100), nullable=False),
        sa.Column("value", JSONB, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("updated_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_platform_config_category", "platform_config", ["category"])
    op.create_index("ix_platform_config_key", "platform_config", ["key"], unique=True)

    # ── ai_providers ─────────────────────────────────────────────────────────
    op.create_table(
        "ai_providers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("provider_type", sa.String(50), nullable=False),
        sa.Column("base_url", sa.String(500), nullable=False),
        sa.Column("api_key_encrypted", sa.Text, nullable=False),
        sa.Column("models", JSONB, nullable=False, server_default="[]"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # ── ai_task_routing ───────────────────────────────────────────────────────
    op.create_table(
        "ai_task_routing",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("task_type", sa.String(50), nullable=False),
        sa.Column("primary_provider_id", UUID(as_uuid=True),
                  sa.ForeignKey("ai_providers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("primary_model", sa.String(100), nullable=False, server_default=""),
        sa.Column("fallback_provider_id", UUID(as_uuid=True),
                  sa.ForeignKey("ai_providers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("fallback_model", sa.String(100), nullable=True),
        sa.Column("temperature", sa.Float, nullable=False, server_default="0.1"),
        sa.Column("max_tokens", sa.Integer, nullable=False, server_default="2000"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
    )
    op.create_index("ix_ai_task_routing_task_type", "ai_task_routing", ["task_type"], unique=True)

    # ── Seed: branding defaults ───────────────────────────────────────────────
    conn = op.get_bind()
    now = datetime.now(timezone.utc)

    branding_seeds = [
        ("branding", "platform_name",   "MetadataHub",          "平台名称"),
        ("branding", "primary_color",   "#6C5CE7",              "主色调"),
        ("branding", "login_tagline",   "AI 驱动的数据分析平台", "登录页标语"),
        ("branding", "default_language","zh-CN",                "默认语言"),
    ]
    for category, key, val, desc in branding_seeds:
        conn.execute(sa.text(
            "INSERT INTO platform_config (id, category, key, value, description, updated_at) "
            "VALUES (:id, :category, :key, CAST(:value AS jsonb), :desc, :now)"
        ), {"id": str(uuid.uuid4()), "category": category, "key": key,
            "value": f'"{val}"', "desc": desc, "now": now})

    # ── Seed: AI provider from env (if configured) ────────────────────────────
    ai_base_url = os.getenv("AI_BASE_URL", "").strip()
    ai_api_key  = os.getenv("AI_API_KEY", "").strip()
    ai_model    = os.getenv("AI_MODEL", "moonshot-v1-8k").strip()

    provider_id: str | None = None

    if ai_base_url and ai_api_key:
        # Encrypt API key using Fernet
        encryption_key = os.getenv("ENCRYPTION_KEY", "kQ5zefzrflDUQSGiOhvGtKC2-gUMe8G7WtJdr7NuySA=")
        try:
            from cryptography.fernet import Fernet
            encrypted = Fernet(encryption_key.encode()).encrypt(ai_api_key.encode()).decode()
        except Exception:
            encrypted = ai_api_key  # fallback (unencrypted) if Fernet not available

        provider_id = str(uuid.uuid4())
        # Detect provider name from base_url
        if "moonshot" in ai_base_url:
            name = "Kimi (Moonshot)"
            model_list = '[{"id": "moonshot-v1-8k", "name": "Kimi 8K", "context_window": 8000}, {"id": "moonshot-v1-32k", "name": "Kimi 32K", "context_window": 32000}]'
        elif "deepseek" in ai_base_url:
            name = "DeepSeek"
            model_list = '[{"id": "deepseek-chat", "name": "DeepSeek Chat", "context_window": 64000}]'
        elif "openai" in ai_base_url:
            name = "OpenAI"
            model_list = '[{"id": "gpt-4o", "name": "GPT-4o", "context_window": 128000}]'
        else:
            name = "AI Provider"
            model_list = f'[{{"id": "{ai_model}", "name": "{ai_model}", "context_window": 8000}}]'

        conn.execute(sa.text(
            "INSERT INTO ai_providers (id, name, provider_type, base_url, api_key_encrypted, models, is_active, sort_order, created_at, updated_at) "
            "VALUES (:id, :name, 'openai_compatible', :base_url, :api_key, CAST(:models AS jsonb), true, 0, :now, :now)"
        ), {"id": provider_id, "name": name, "base_url": ai_base_url,
            "api_key": encrypted, "models": model_list, "now": now})

    # ── Seed: task routing placeholders ──────────────────────────────────────
    task_types = [
        ("nl2sql",         "自然语言转 SQL"),
        ("summary",        "数据摘要生成"),
        ("chart_suggest",  "图表类型推荐"),
        ("schema_describe","字段描述生成"),
    ]
    for task_type, _ in task_types:
        conn.execute(sa.text(
            "INSERT INTO ai_task_routing (id, task_type, primary_provider_id, primary_model, temperature, max_tokens, is_active) "
            "VALUES (:id, :task_type, :provider_id, :model, 0.1, 2000, true)"
        ), {"id": str(uuid.uuid4()), "task_type": task_type,
            "provider_id": provider_id,
            "model": ai_model if provider_id else ""})


def downgrade() -> None:
    op.drop_table("ai_task_routing")
    op.drop_table("ai_providers")
    op.drop_index("ix_platform_config_key", table_name="platform_config")
    op.drop_index("ix_platform_config_category", table_name="platform_config")
    op.drop_table("platform_config")
