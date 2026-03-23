from __future__ import annotations

import uuid
from typing import Any, Optional

from pydantic import BaseModel, Field


# ── Branding ──────────────────────────────────────────────────────────────────

class BrandingConfig(BaseModel):
    platform_name: str = "MetadataHub"
    primary_color: str = "#6C5CE7"
    login_tagline: str = "AI 驱动的数据分析平台"
    default_language: str = "zh-CN"


class BrandingUpdateRequest(BaseModel):
    platform_name: Optional[str] = None
    primary_color: Optional[str] = None
    login_tagline: Optional[str] = None
    default_language: Optional[str] = None


class PublicBrandingResponse(BaseModel):
    platform_name: str
    logo_light_url: Optional[str] = None
    logo_dark_url: Optional[str] = None
    favicon_url: Optional[str] = None
    primary_color: str
    login_tagline: str


# ── AI Model info ─────────────────────────────────────────────────────────────

class ModelInfo(BaseModel):
    id: str
    name: str
    context_window: int = 8000


# ── AI Provider ───────────────────────────────────────────────────────────────

class AIProviderCreate(BaseModel):
    name: str
    provider_type: str = Field(..., pattern="^(openai_compatible|anthropic|custom)$")
    base_url: str
    api_key: str                        # plain text — encrypted on server
    models: list[ModelInfo] = []
    sort_order: int = 0


class AIProviderUpdate(BaseModel):
    name: Optional[str] = None
    provider_type: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None       # if None, keep existing key
    models: Optional[list[ModelInfo]] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class AIProviderOut(BaseModel):
    id: uuid.UUID
    name: str
    provider_type: str
    base_url: str
    api_key_masked: str                 # never return plain key
    models: list[ModelInfo]
    is_active: bool
    sort_order: int

    model_config = {"from_attributes": True}


class ProviderTestRequest(BaseModel):
    prompt: str = "请回复 OK"


class ProviderTestResponse(BaseModel):
    success: bool
    latency_ms: int
    response: Optional[str] = None
    error: Optional[str] = None


# ── AI Task Routing ───────────────────────────────────────────────────────────

class TaskRoutingItem(BaseModel):
    task_type: str
    primary_provider_id: Optional[uuid.UUID] = None
    primary_model: str = ""
    fallback_provider_id: Optional[uuid.UUID] = None
    fallback_model: Optional[str] = None
    temperature: float = 0.1
    max_tokens: int = 2000
    is_active: bool = True


class TaskRoutingOut(BaseModel):
    id: uuid.UUID
    task_type: str
    primary_provider_id: Optional[uuid.UUID]
    primary_model: str
    fallback_provider_id: Optional[uuid.UUID]
    fallback_model: Optional[str]
    temperature: float
    max_tokens: int
    is_active: bool
    # Resolved provider names for display
    primary_provider_name: Optional[str] = None
    fallback_provider_name: Optional[str] = None

    model_config = {"from_attributes": True}
