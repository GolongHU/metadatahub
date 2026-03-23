from __future__ import annotations

import json
from typing import Any, Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.platform import PlatformConfig

CACHE_TTL = 300  # 5 minutes


async def get_config(
    category: str,
    key: str,
    db: AsyncSession,
    redis=None,
) -> Optional[Any]:
    """Get a config value, using Redis cache when available."""
    cache_key = f"platform_config:{category}:{key}"

    if redis is not None:
        try:
            cached = await redis.get(cache_key)
            if cached is not None:
                return json.loads(cached)
        except Exception:
            pass

    result = await db.execute(
        select(PlatformConfig).where(
            PlatformConfig.category == category,
            PlatformConfig.key == key,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        return None

    if redis is not None:
        try:
            await redis.setex(cache_key, CACHE_TTL, json.dumps(row.value))
        except Exception:
            pass

    return row.value


async def set_config(
    category: str,
    key: str,
    value: Any,
    user_id,
    db: AsyncSession,
    redis=None,
    description: Optional[str] = None,
) -> None:
    """Upsert a config value and invalidate cache."""
    await db.execute(
        text(
            """
            INSERT INTO platform_config (id, category, key, value, description, updated_by, updated_at)
            VALUES (gen_random_uuid(), :category, :key, CAST(:value AS jsonb), :description, :user_id, now())
            ON CONFLICT (key) DO UPDATE
              SET value = CAST(:value AS jsonb), updated_by = :user_id, updated_at = now()
            """
        ),
        {
            "category": category,
            "key": key,
            "value": json.dumps(value),
            "description": description,
            "user_id": str(user_id) if user_id else None,
        },
    )
    await db.commit()

    if redis is not None:
        try:
            await redis.delete(f"platform_config:{category}:{key}")
        except Exception:
            pass


async def get_all_branding(db: AsyncSession, redis=None) -> dict[str, Any]:
    """Return all branding keys as a flat dict."""
    result = await db.execute(
        select(PlatformConfig).where(PlatformConfig.category == "branding")
    )
    rows = result.scalars().all()
    return {r.key: r.value for r in rows}
