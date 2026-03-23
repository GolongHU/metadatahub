from __future__ import annotations

import time
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.platform import AIProvider, AITaskRouting
from app.schemas.auth import AuthenticatedUser
from app.schemas.platform import (
    AIProviderCreate,
    AIProviderOut,
    AIProviderUpdate,
    ModelInfo,
    ProviderTestRequest,
    ProviderTestResponse,
    TaskRoutingItem,
    TaskRoutingOut,
)
from app.services.crypto import decrypt_api_key, encrypt_api_key, mask_api_key
from app.services.permission_map import require_admin

router = APIRouter(prefix="/admin/ai", tags=["ai-admin"])

_TASK_TYPES = {"nl2sql", "summary", "chart_suggest", "schema_describe"}


# ── Providers ─────────────────────────────────────────────────────────────────

@router.get("/providers", response_model=list[AIProviderOut])
async def list_providers(
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_admin),
) -> list[AIProviderOut]:
    result = await db.execute(
        select(AIProvider).where(AIProvider.is_active == True).order_by(AIProvider.sort_order, AIProvider.name)  # noqa: E712
    )
    providers = result.scalars().all()
    return [_provider_to_out(p) for p in providers]


@router.post("/providers", response_model=AIProviderOut, status_code=status.HTTP_201_CREATED)
async def create_provider(
    body: AIProviderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_admin),
) -> AIProviderOut:
    provider = AIProvider(
        name=body.name,
        provider_type=body.provider_type,
        base_url=body.base_url,
        api_key_encrypted=encrypt_api_key(body.api_key),
        models=[m.model_dump() for m in body.models],
        is_active=True,
        sort_order=body.sort_order,
    )
    db.add(provider)
    await db.commit()
    await db.refresh(provider)
    return _provider_to_out(provider)


@router.put("/providers/{provider_id}", response_model=AIProviderOut)
async def update_provider(
    provider_id: uuid.UUID,
    body: AIProviderUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_admin),
) -> AIProviderOut:
    provider = await _get_provider_or_404(provider_id, db)

    if body.name is not None:
        provider.name = body.name
    if body.provider_type is not None:
        provider.provider_type = body.provider_type
    if body.base_url is not None:
        provider.base_url = body.base_url
    if body.api_key is not None:
        provider.api_key_encrypted = encrypt_api_key(body.api_key)
    if body.models is not None:
        provider.models = [m.model_dump() for m in body.models]
    if body.is_active is not None:
        provider.is_active = body.is_active
    if body.sort_order is not None:
        provider.sort_order = body.sort_order

    await db.commit()
    await db.refresh(provider)
    return _provider_to_out(provider)


@router.delete("/providers/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_provider(
    provider_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_admin),
) -> None:
    provider = await _get_provider_or_404(provider_id, db)
    provider.is_active = False
    await db.commit()


# ── Connectivity test ─────────────────────────────────────────────────────────

@router.post("/providers/{provider_id}/test", response_model=ProviderTestResponse)
async def test_provider(
    provider_id: uuid.UUID,
    body: ProviderTestRequest = ProviderTestRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_admin),
) -> ProviderTestResponse:
    provider = await _get_provider_or_404(provider_id, db)

    api_key = decrypt_api_key(provider.api_key_encrypted)
    models_list: list[dict] = provider.models or []
    if not models_list:
        return ProviderTestResponse(success=False, latency_ms=0, error="No models configured for this provider")

    first_model = models_list[0]["id"]
    start = time.monotonic()

    try:
        response_text = await _call_provider(
            provider_type=provider.provider_type,
            base_url=provider.base_url,
            api_key=api_key,
            model=first_model,
            prompt=body.prompt,
        )
        latency_ms = int((time.monotonic() - start) * 1000)
        return ProviderTestResponse(success=True, latency_ms=latency_ms, response=response_text[:200])
    except Exception as exc:
        latency_ms = int((time.monotonic() - start) * 1000)
        return ProviderTestResponse(success=False, latency_ms=latency_ms, error=str(exc)[:500])


# ── Task Routing ──────────────────────────────────────────────────────────────

@router.get("/task-routing", response_model=list[TaskRoutingOut])
async def get_task_routing(
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_admin),
) -> list[TaskRoutingOut]:
    result = await db.execute(select(AITaskRouting).order_by(AITaskRouting.task_type))
    routings = result.scalars().all()

    # Load provider names for display
    provider_ids = {r.primary_provider_id for r in routings if r.primary_provider_id}
    provider_ids |= {r.fallback_provider_id for r in routings if r.fallback_provider_id}

    provider_names: dict[uuid.UUID, str] = {}
    if provider_ids:
        p_result = await db.execute(
            select(AIProvider.id, AIProvider.name).where(AIProvider.id.in_(provider_ids))
        )
        provider_names = {row.id: row.name for row in p_result}

    return [
        TaskRoutingOut(
            id=r.id,
            task_type=r.task_type,
            primary_provider_id=r.primary_provider_id,
            primary_model=r.primary_model,
            fallback_provider_id=r.fallback_provider_id,
            fallback_model=r.fallback_model,
            temperature=r.temperature,
            max_tokens=r.max_tokens,
            is_active=r.is_active,
            primary_provider_name=provider_names.get(r.primary_provider_id) if r.primary_provider_id else None,
            fallback_provider_name=provider_names.get(r.fallback_provider_id) if r.fallback_provider_id else None,
        )
        for r in routings
    ]


@router.put("/task-routing", response_model=list[TaskRoutingOut])
async def update_task_routing(
    body: list[TaskRoutingItem],
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_admin),
) -> list[TaskRoutingOut]:
    for item in body:
        result = await db.execute(
            select(AITaskRouting).where(AITaskRouting.task_type == item.task_type)
        )
        routing = result.scalar_one_or_none()

        if routing is None:
            routing = AITaskRouting(task_type=item.task_type)
            db.add(routing)

        routing.primary_provider_id = item.primary_provider_id
        routing.primary_model = item.primary_model
        routing.fallback_provider_id = item.fallback_provider_id
        routing.fallback_model = item.fallback_model
        routing.temperature = item.temperature
        routing.max_tokens = item.max_tokens
        routing.is_active = item.is_active

    await db.commit()

    # Return fresh data
    from app.api.ai_admin import get_task_routing as _get
    return await _get(db=db, current_user=current_user)


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_provider_or_404(provider_id: uuid.UUID, db: AsyncSession) -> AIProvider:
    result = await db.execute(select(AIProvider).where(AIProvider.id == provider_id))
    provider = result.scalar_one_or_none()
    if provider is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")
    return provider


def _provider_to_out(p: AIProvider) -> AIProviderOut:
    plain_key = ""
    try:
        plain_key = decrypt_api_key(p.api_key_encrypted)
    except Exception:
        pass
    return AIProviderOut(
        id=p.id,
        name=p.name,
        provider_type=p.provider_type,
        base_url=p.base_url,
        api_key_masked=mask_api_key(plain_key) if plain_key else "****",
        models=[ModelInfo(**m) for m in (p.models or [])],
        is_active=p.is_active,
        sort_order=p.sort_order,
    )


async def _call_provider(
    provider_type: str,
    base_url: str,
    api_key: str,
    model: str,
    prompt: str,
) -> str:
    """Make a single test request to the provider and return the response text."""
    if provider_type == "anthropic":
        from anthropic import AsyncAnthropic
        client = AsyncAnthropic(api_key=api_key)
        response = await client.messages.create(
            model=model,
            max_tokens=50,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text

    else:  # openai_compatible (default)
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        response = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=50,
        )
        return response.choices[0].message.content or ""
