from __future__ import annotations

import os
import shutil
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.schemas.auth import AuthenticatedUser
from app.schemas.platform import BrandingUpdateRequest, PublicBrandingResponse
from app.services.permission_map import require_admin
from app.services.platform_config import get_all_branding, get_config, set_config

router = APIRouter(tags=["config"])

_LOGO_DIR = "uploads/branding"
_MAX_FILE_BYTES = 2 * 1024 * 1024  # 2 MB
_ALLOWED_IMAGE_TYPES = {"image/svg+xml", "image/png", "image/jpeg", "image/x-icon", "image/vnd.microsoft.icon"}


# ── Public (no auth) ──────────────────────────────────────────────────────────

@router.get("/config/branding/public", response_model=PublicBrandingResponse)
async def get_public_branding(db: AsyncSession = Depends(get_db)) -> PublicBrandingResponse:
    """Return branding config for login page (no auth required)."""
    data = await get_all_branding(db)
    return PublicBrandingResponse(
        platform_name=data.get("platform_name", "MetadataHub"),
        logo_light_url=data.get("logo_light_url"),
        logo_dark_url=data.get("logo_dark_url"),
        favicon_url=data.get("favicon_url"),
        primary_color=data.get("primary_color", "#6C5CE7"),
        login_tagline=data.get("login_tagline", "AI 驱动的数据分析平台"),
    )


# ── Admin branding ────────────────────────────────────────────────────────────

@router.get("/admin/config/branding")
async def get_branding(
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_admin),
) -> dict:
    return await get_all_branding(db)


@router.put("/admin/config/branding")
async def update_branding(
    body: BrandingUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_admin),
) -> dict:
    updates = body.model_dump(exclude_none=True)
    for key, value in updates.items():
        await set_config("branding", key, value, current_user.user_id, db)
    return await get_all_branding(db)


@router.post("/admin/config/branding/logo")
async def upload_logo(
    file: UploadFile = File(...),
    type: str = Query("light", pattern="^(light|dark)$"),
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_admin),
) -> dict:
    return await _upload_branding_file(
        file=file,
        config_key=f"logo_{type}_url",
        filename=f"logo_{type}",
        db=db,
        user_id=current_user.user_id,
    )


@router.post("/admin/config/branding/favicon")
async def upload_favicon(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_admin),
) -> dict:
    return await _upload_branding_file(
        file=file,
        config_key="favicon_url",
        filename="favicon",
        db=db,
        user_id=current_user.user_id,
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _upload_branding_file(
    file: UploadFile,
    config_key: str,
    filename: str,
    db: AsyncSession,
    user_id,
) -> dict:
    if file.content_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: {file.content_type}. Allowed: SVG, PNG, JPEG, ICO",
        )

    content = await file.read()
    if len(content) > _MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large. Maximum size is 2 MB.",
        )

    os.makedirs(_LOGO_DIR, exist_ok=True)
    ext = _extension_from_content_type(file.content_type)
    dest_path = os.path.join(_LOGO_DIR, f"{filename}{ext}")

    with open(dest_path, "wb") as f:
        f.write(content)

    url = f"/uploads/branding/{filename}{ext}"
    await set_config("branding", config_key, url, user_id, db)
    return {"url": url}


def _extension_from_content_type(ct: str) -> str:
    mapping = {
        "image/svg+xml": ".svg",
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/x-icon": ".ico",
        "image/vnd.microsoft.icon": ".ico",
    }
    return mapping.get(ct, ".png")
