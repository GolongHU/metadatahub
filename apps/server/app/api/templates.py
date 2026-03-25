from __future__ import annotations

import asyncio
import copy
import uuid as _uuid
from typing import Any
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func, text
import uuid as _uuid_mod
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.dashboard import DashboardConfig, WidgetLibrary
from app.schemas.auth import AuthenticatedUser
from app.schemas.template import (
    CloneRequest, RenderRequest, RenderResponse,
    TemplateCreate, TemplateDetail, TemplateOut, TemplateUpdate,
    WidgetLibraryOut, MarketplaceListItem,
)
from app.services.permission_resolver import PermissionResolver
from app.services.query_executor import execute_query

router = APIRouter(tags=["templates"])


# ── Helpers ────────────────────────────────────────────────────────────────────

def _to_out(dc: DashboardConfig) -> TemplateOut:
    widgets = (dc.config or {}).get("widgets", [])
    return TemplateOut(
        id=dc.id,
        name=dc.name,
        template_type=getattr(dc, "template_type", "custom"),
        assigned_roles=getattr(dc, "assigned_roles", []) or [],
        tags=getattr(dc, "tags", []) or [],
        version=getattr(dc, "version", 1),
        is_published=getattr(dc, "is_published", False),
        thumbnail_url=getattr(dc, "thumbnail_url", None),
        config=dc.config or {},
        created_by=dc.created_by,
        created_at=dc.created_at,
        updated_at=dc.updated_at,
        widget_count=len(widgets),
    )


def _to_detail(dc: DashboardConfig) -> TemplateDetail:
    out = _to_out(dc)
    return TemplateDetail(
        **out.model_dump(),
        source_dataset_ids=getattr(dc, "source_dataset_ids", []) or [],
    )


def _require_admin(user: AuthenticatedUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")


async def _get_template_or_404(db: AsyncSession, template_id: str) -> DashboardConfig:
    result = await db.execute(select(DashboardConfig).where(DashboardConfig.id == template_id))
    dc = result.scalar_one_or_none()
    if not dc:
        raise HTTPException(status_code=404, detail="Template not found")
    return dc


async def _run_widget_query(
    widget: dict[str, Any],
    filters: dict[str, Any],
    user: AuthenticatedUser,
    db: AsyncSession,
    dataset_id: str | None,
) -> tuple[str, Any]:
    widget_id = widget.get("id", "unknown")
    widget_config = widget.get("config", {})
    sql = widget_config.get("query", "")

    if not sql or not sql.strip():
        return widget_id, {"columns": [], "rows": [], "row_count": 0}

    try:
        # Apply user-supplied filter substitutions
        for k, v in filters.items():
            sql = sql.replace(f"{{{k}}}", str(v))

        if dataset_id:
            # ── DuckDB path: dataset table name follows "dataset_{id.hex}" ──
            try:
                parsed = _uuid_mod.UUID(str(dataset_id))
                table_name = f"dataset_{parsed.hex}"
            except ValueError:
                table_name = str(dataset_id)

            # Replace {table} / {dataset_table} placeholders
            sql = sql.replace("{table}", f'"{table_name}"')
            sql = sql.replace("{dataset_table}", f'"{table_name}"')

            try:
                resolver = PermissionResolver(db)
                resolved = await resolver.resolve(user, dataset_id, sql)
                sql = resolved.get("final_sql", sql)
            except Exception:
                pass

            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, execute_query, sql, table_name)
            return widget_id, {
                "columns": result.columns,
                "rows": result.rows[:500],
                "row_count": result.row_count,
            }
        else:
            # ── PostgreSQL path: system templates query PG tables directly ──
            pg_result = await db.execute(text(sql))
            columns = list(pg_result.keys())
            rows = [list(r) for r in pg_result.fetchall()]
            # Cap rows and serialize non-primitive types
            rows_out = []
            for row in rows[:500]:
                rows_out.append([
                    float(v) if hasattr(v, '__float__') and not isinstance(v, (int, float, str, bool, type(None))) else v
                    for v in row
                ])
            return widget_id, {"columns": columns, "rows": rows_out, "row_count": len(rows)}

    except Exception as exc:
        return widget_id, {"error": str(exc)}


# ── Widget Library ─────────────────────────────────────────────────────────────

@router.get("/widget-library", response_model=list[WidgetLibraryOut])
async def list_widget_library(
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> list[WidgetLibraryOut]:
    result = await db.execute(select(WidgetLibrary).order_by(WidgetLibrary.sort_order))
    rows = result.scalars().all()
    return [WidgetLibraryOut.model_validate(r) for r in rows]


# ── Admin: Template CRUD ───────────────────────────────────────────────────────

@router.get("/admin/templates", response_model=list[TemplateOut])
async def list_templates(
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> list[TemplateOut]:
    if current_user.role == "admin":
        stmt = select(DashboardConfig).where(
            DashboardConfig.dashboard_type == "template"
        ).order_by(DashboardConfig.created_at.desc())
    else:
        # Non-admin: see templates assigned to their role
        stmt = select(DashboardConfig).where(
            DashboardConfig.dashboard_type == "template",
            DashboardConfig.assigned_roles.contains([current_user.role]),
        ).order_by(DashboardConfig.created_at.desc())

    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [_to_out(r) for r in rows]


@router.post("/admin/templates", response_model=TemplateDetail, status_code=201)
async def create_template(
    body: TemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> TemplateDetail:
    _require_admin(current_user)

    dc = DashboardConfig(
        id=_uuid.uuid4(),
        name=body.name,
        dataset_id=str(body.dataset_ids[0]) if body.dataset_ids else None,
        config=body.config.model_dump(),
        is_default=False,
        created_by=current_user.id,
        dashboard_type="template",
        owner_id=current_user.id,
        is_pinned=False,
        sort_order=0,
        template_type=body.template_type,
        assigned_roles=body.assigned_roles,
        source_dataset_ids=[str(d) for d in body.dataset_ids],
        version=1,
        is_published=False,
        tags=body.tags,
    )
    db.add(dc)
    await db.commit()
    await db.refresh(dc)
    return _to_detail(dc)


@router.get("/admin/templates/{template_id}", response_model=TemplateDetail)
async def get_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> TemplateDetail:
    dc = await _get_template_or_404(db, template_id)
    if current_user.role != "admin":
        roles = getattr(dc, "assigned_roles", []) or []
        if current_user.role not in roles:
            raise HTTPException(status_code=403, detail="Access denied")
    return _to_detail(dc)


@router.put("/admin/templates/{template_id}", response_model=TemplateDetail)
async def update_template(
    template_id: str,
    body: TemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> TemplateDetail:
    _require_admin(current_user)
    dc = await _get_template_or_404(db, template_id)

    if body.name is not None:
        dc.name = body.name
    if body.config is not None:
        dc.config = body.config.model_dump()
        dc.version = (getattr(dc, "version", 1) or 1) + 1
    if body.assigned_roles is not None:
        dc.assigned_roles = body.assigned_roles
    if body.tags is not None:
        dc.tags = body.tags
    if body.is_published is not None:
        dc.is_published = body.is_published

    dc.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(dc)
    return _to_detail(dc)


@router.delete("/admin/templates/{template_id}", status_code=204)
async def delete_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> None:
    _require_admin(current_user)
    dc = await _get_template_or_404(db, template_id)
    await db.delete(dc)
    await db.commit()


@router.post("/admin/templates/{template_id}/clone", response_model=TemplateDetail, status_code=201)
async def clone_template(
    template_id: str,
    body: CloneRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> TemplateDetail:
    _require_admin(current_user)
    src = await _get_template_or_404(db, template_id)

    new_config = copy.deepcopy(src.config or {})
    new_dc = DashboardConfig(
        id=_uuid.uuid4(),
        name=body.new_name,
        dataset_id=src.dataset_id,
        config=new_config,
        is_default=False,
        created_by=current_user.id,
        dashboard_type="template",
        owner_id=current_user.id,
        is_pinned=False,
        sort_order=0,
        template_type="custom",
        assigned_roles=body.assigned_roles,
        source_dataset_ids=getattr(src, "source_dataset_ids", []) or [],
        version=1,
        is_published=False,
        tags=getattr(src, "tags", []) or [],
    )
    db.add(new_dc)
    await db.commit()
    await db.refresh(new_dc)
    return _to_detail(new_dc)


@router.post("/admin/templates/{template_id}/publish", response_model=TemplateDetail)
async def publish_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> TemplateDetail:
    _require_admin(current_user)
    dc = await _get_template_or_404(db, template_id)
    dc.is_published = True
    dc.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(dc)
    return _to_detail(dc)


# ── Marketplace ────────────────────────────────────────────────────────────────

@router.get("/templates/marketplace", response_model=list[MarketplaceListItem])
async def list_marketplace(
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> list[MarketplaceListItem]:
    result = await db.execute(
        select(DashboardConfig).where(
            DashboardConfig.dashboard_type == "template",
            DashboardConfig.is_published == True,
        ).order_by(DashboardConfig.created_at.desc())
    )
    rows = result.scalars().all()
    return [
        MarketplaceListItem(
            id=r.id,
            name=r.name,
            tags=getattr(r, "tags", []) or [],
            version=getattr(r, "version", 1),
            thumbnail_url=getattr(r, "thumbnail_url", None),
            widget_count=len((r.config or {}).get("widgets", [])),
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.post("/templates/marketplace/{template_id}/import", response_model=TemplateDetail, status_code=201)
async def import_from_marketplace(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> TemplateDetail:
    _require_admin(current_user)
    src = await _get_template_or_404(db, template_id)
    if not getattr(src, "is_published", False):
        raise HTTPException(status_code=404, detail="Template not in marketplace")

    new_dc = DashboardConfig(
        id=_uuid.uuid4(),
        name=f"{src.name} (导入)",
        dataset_id=src.dataset_id,
        config=copy.deepcopy(src.config or {}),
        is_default=False,
        created_by=current_user.id,
        dashboard_type="template",
        owner_id=current_user.id,
        is_pinned=False,
        sort_order=0,
        template_type="marketplace",
        assigned_roles=[],
        source_dataset_ids=getattr(src, "source_dataset_ids", []) or [],
        version=1,
        is_published=False,
        tags=getattr(src, "tags", []) or [],
    )
    db.add(new_dc)
    await db.commit()
    await db.refresh(new_dc)
    return _to_detail(new_dc)


# ── Render ────────────────────────────────────────────────────────────────────

@router.post("/templates/{template_id}/render", response_model=RenderResponse)
async def render_template(
    template_id: str,
    body: RenderRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> RenderResponse:
    dc = await _get_template_or_404(db, template_id)

    # Role check
    if current_user.role != "admin":
        roles = getattr(dc, "assigned_roles", []) or []
        if current_user.role not in roles:
            raise HTTPException(status_code=403, detail="Access denied")

    widgets = (dc.config or {}).get("widgets", [])
    dataset_id = dc.dataset_id

    tasks = [
        _run_widget_query(w, body.filters, current_user, db, dataset_id)
        for w in widgets
    ]
    results = await asyncio.gather(*tasks)

    return RenderResponse(
        template_id=dc.id,
        widgets={wid: data for wid, data in results},
    )
