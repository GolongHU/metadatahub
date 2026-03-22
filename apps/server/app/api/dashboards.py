from __future__ import annotations

import asyncio
import uuid
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.dashboard import DashboardConfig
from app.models.dataset import Dataset
from app.schemas.auth import AuthenticatedUser
from app.schemas.dashboard import (
    AddWidgetRequest,
    AutoGenerateRequest,
    CreateDashboardRequest,
    DashboardDetail,
    DashboardListItem,
    DashboardQueryRequest,
    DashboardQueryResponse,
    UpdateDashboardRequest,
    WidgetResult,
)
from app.schemas.dataset import DatasetSchema
from app.services.dashboard_generator import generate_dashboard_config
from app.services.permission_resolver import PermissionResolver
from app.services.query_executor import execute_query

router = APIRouter(prefix="/dashboards", tags=["dashboards"])

_executor = ThreadPoolExecutor(max_workers=4)

# ── Helpers ───────────────────────────────────────────────────────────────────

import re

_SAFE_FILTER_RE = re.compile(r"^[\u4e00-\u9fff\w\s\-\.@（）()]+$")


def _validate_filter_value(v: str) -> str:
    v = v.strip()
    if not v or not _SAFE_FILTER_RE.match(v):
        raise ValueError(f"Unsafe filter value: {v!r}")
    return v.replace("'", "''")


def _build_filtered_table(table_name: str, filters: dict[str, str]) -> str:
    """Inject filters at source table level so aggregations still work."""
    if not filters:
        return table_name
    clauses = []
    for field, value in filters.items():
        try:
            safe_val = _validate_filter_value(value)
        except ValueError:
            continue
        clauses.append(f'"{field}" = \'{safe_val}\'')
    if not clauses:
        return table_name
    where = " AND ".join(clauses)
    return f"(SELECT * FROM {table_name} WHERE {where}) AS {table_name}"


async def _get_dashboard_or_404(dashboard_id: uuid.UUID, db: AsyncSession) -> DashboardConfig:
    result = await db.execute(
        select(DashboardConfig).where(DashboardConfig.id == dashboard_id)
    )
    d = result.scalars().first()
    if d is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dashboard not found")
    return d


def _check_write_permission(dashboard: DashboardConfig, current_user: AuthenticatedUser) -> None:
    is_admin = current_user.role == "admin"
    if is_admin:
        return
    user_id = current_user.user_id if isinstance(current_user.user_id, uuid.UUID) else uuid.UUID(str(current_user.user_id))
    if dashboard.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot modify this dashboard")


def _to_detail(d: DashboardConfig) -> DashboardDetail:
    return DashboardDetail(
        id=d.id,
        name=d.name,
        dataset_id=d.dataset_id,
        config=d.config,
        dashboard_type=d.dashboard_type,
        owner_id=d.owner_id,
        is_pinned=d.is_pinned,
        is_default=d.is_default,
        created_at=d.created_at,
        updated_at=d.updated_at,
    )


async def _run_widget_query(
    widget_id: str,
    raw_query: str,
    table_name: str,
    filters: dict[str, str],
    user: AuthenticatedUser,
    dataset_id: uuid.UUID,
    db: AsyncSession,
) -> tuple[str, WidgetResult]:
    try:
        filtered_table = _build_filtered_table(table_name, filters)
        sql = raw_query.replace("{table}", filtered_table)

        resolver = PermissionResolver(db)
        resolved = await resolver.resolve(
            user=user,
            dataset_id=dataset_id,
            base_sql=sql,
            table_name=table_name,
        )
        final_sql = resolved["sql"]

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            _executor,
            partial(execute_query, final_sql, table_name),
        )

        return widget_id, WidgetResult(
            columns=result.columns,
            rows=result.rows,
            row_count=result.row_count,
            execution_time_ms=result.execution_time_ms,
        )
    except Exception as exc:
        return widget_id, WidgetResult(
            columns=[], rows=[], row_count=0, execution_time_ms=0,
            error=str(exc),
        )


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[DashboardListItem])
async def list_dashboards(
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> list[DashboardListItem]:
    user_id = current_user.user_id if isinstance(current_user.user_id, uuid.UUID) else uuid.UUID(str(current_user.user_id))

    result = await db.execute(
        select(DashboardConfig)
        .where(
            or_(
                DashboardConfig.dashboard_type.in_(["fixed", "auto"]),
                and_(
                    DashboardConfig.dashboard_type == "personal",
                    DashboardConfig.owner_id == user_id,
                ),
            )
        )
        .order_by(
            DashboardConfig.is_pinned.desc(),
            DashboardConfig.sort_order.asc(),
            DashboardConfig.created_at.desc(),
        )
    )
    dashboards = result.scalars().all()

    # Load dataset names in one query
    dataset_ids = {d.dataset_id for d in dashboards}
    dataset_names: dict[uuid.UUID, str] = {}
    if dataset_ids:
        ds_result = await db.execute(
            select(Dataset.id, Dataset.name).where(Dataset.id.in_(dataset_ids))
        )
        for row in ds_result:
            dataset_names[row.id] = row.name

    return [
        DashboardListItem(
            id=d.id,
            name=d.name,
            dataset_id=d.dataset_id,
            dataset_name=dataset_names.get(d.dataset_id, ""),
            dashboard_type=d.dashboard_type,
            is_pinned=d.is_pinned,
            widget_count=len(d.config.get("widgets", [])),
            updated_at=d.updated_at,
        )
        for d in dashboards
    ]


# ── Auto-generate (must be before /{id} to avoid routing conflict) ────────────

@router.post("/auto-generate", response_model=DashboardDetail)
async def auto_generate_dashboard(
    body: AutoGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> DashboardDetail:
    result = await db.execute(
        select(Dataset).where(Dataset.id == body.dataset_id, Dataset.is_active == True)  # noqa: E712
    )
    dataset = result.scalars().first()
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")

    schema = DatasetSchema(**dataset.schema_info)
    table_name = f"dataset_{dataset.id.hex}"

    config = generate_dashboard_config(
        dataset_name=dataset.name,
        dataset_id=str(dataset.id),
        schema=schema,
        table_name=table_name,
    )

    # Deactivate existing auto dashboards for this dataset
    existing = await db.execute(
        select(DashboardConfig).where(
            DashboardConfig.dataset_id == body.dataset_id,
            DashboardConfig.dashboard_type == "auto",
        )
    )
    for old in existing.scalars().all():
        old.is_default = False

    user_id = current_user.user_id if isinstance(current_user.user_id, uuid.UUID) else uuid.UUID(str(current_user.user_id))
    dashboard = DashboardConfig(
        name=config["title"],
        dataset_id=body.dataset_id,
        config=config,
        is_default=True,
        dashboard_type="auto",
        owner_id=user_id,
        created_by=user_id,
    )
    db.add(dashboard)
    await db.commit()
    await db.refresh(dashboard)
    return _to_detail(dashboard)


# ── Create personal dashboard ─────────────────────────────────────────────────

@router.post("", response_model=DashboardDetail, status_code=status.HTTP_201_CREATED)
async def create_dashboard(
    body: CreateDashboardRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> DashboardDetail:
    user_id = current_user.user_id if isinstance(current_user.user_id, uuid.UUID) else uuid.UUID(str(current_user.user_id))
    table_name = f"dataset_{body.dataset_id.hex}"
    config = body.config or {
        "title": body.name,
        "dataset_id": str(body.dataset_id),
        "table_name": table_name,
        "filters": [],
        "widgets": [],
    }
    dashboard = DashboardConfig(
        name=body.name,
        dataset_id=body.dataset_id,
        config=config,
        dashboard_type="personal",
        owner_id=user_id,
        created_by=user_id,
    )
    db.add(dashboard)
    await db.commit()
    await db.refresh(dashboard)
    return _to_detail(dashboard)


# ── Get ───────────────────────────────────────────────────────────────────────

@router.get("/{dashboard_id}", response_model=DashboardDetail)
async def get_dashboard(
    dashboard_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: AuthenticatedUser = Depends(get_current_user),
) -> DashboardDetail:
    return _to_detail(await _get_dashboard_or_404(dashboard_id, db))


# ── Update ────────────────────────────────────────────────────────────────────

@router.put("/{dashboard_id}", response_model=DashboardDetail)
async def update_dashboard(
    dashboard_id: uuid.UUID,
    body: UpdateDashboardRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> DashboardDetail:
    dashboard = await _get_dashboard_or_404(dashboard_id, db)
    _check_write_permission(dashboard, current_user)

    if body.name is not None:
        dashboard.name = body.name
    if body.config is not None:
        dashboard.config = body.config
    if body.is_pinned is not None:
        dashboard.is_pinned = body.is_pinned

    await db.commit()
    await db.refresh(dashboard)
    return _to_detail(dashboard)


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{dashboard_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dashboard(
    dashboard_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> None:
    dashboard = await _get_dashboard_or_404(dashboard_id, db)
    _check_write_permission(dashboard, current_user)
    await db.delete(dashboard)
    await db.commit()


# ── Query widgets ─────────────────────────────────────────────────────────────

@router.post("/{dashboard_id}/query", response_model=DashboardQueryResponse)
async def query_dashboard(
    dashboard_id: uuid.UUID,
    body: DashboardQueryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> DashboardQueryResponse:
    dashboard = await _get_dashboard_or_404(dashboard_id, db)

    config = dashboard.config
    table_name = config.get("table_name", "")
    widgets = config.get("widgets", [])
    filters = body.filters or {}

    tasks = [
        _run_widget_query(
            widget_id=w["id"],
            raw_query=w["query"],
            table_name=table_name,
            filters=filters,
            user=current_user,
            dataset_id=dashboard.dataset_id,
            db=db,
        )
        for w in widgets
        if "query" in w
    ]

    results = await asyncio.gather(*tasks)
    return DashboardQueryResponse(widgets={wid: wr for wid, wr in results})


# ── Add widget ────────────────────────────────────────────────────────────────

@router.post("/{dashboard_id}/widgets")
async def add_widget(
    dashboard_id: uuid.UUID,
    body: AddWidgetRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    dashboard = await _get_dashboard_or_404(dashboard_id, db)
    _check_write_permission(dashboard, current_user)

    config = dict(dashboard.config)
    widgets = list(config.get("widgets", []))

    # Auto-calculate position: next row after last widget
    if widgets:
        max_row = max(w.get("position", {}).get("row", 0) for w in widgets)
        new_row = max_row + 1
    else:
        new_row = 0

    position = body.position or {"row": new_row, "col": 0, "width": 5, "height": 1}
    widget_id = f"widget_{uuid.uuid4().hex[:8]}"

    new_widget: dict = {
        "id": widget_id,
        "type": body.type,
        "title": body.title,
        "query": body.query,
        "position": position,
    }
    if body.chart_type:
        new_widget["chart_type"] = body.chart_type
    if body.format:
        new_widget["format"] = body.format

    widgets.append(new_widget)
    config["widgets"] = widgets
    dashboard.config = config

    await db.commit()
    return {"widget_id": widget_id, "config": config}


# ── Remove widget ─────────────────────────────────────────────────────────────

@router.delete("/{dashboard_id}/widgets/{widget_id}")
async def remove_widget(
    dashboard_id: uuid.UUID,
    widget_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    dashboard = await _get_dashboard_or_404(dashboard_id, db)
    _check_write_permission(dashboard, current_user)

    config = dict(dashboard.config)
    widgets = [w for w in config.get("widgets", []) if w.get("id") != widget_id]
    config["widgets"] = widgets
    dashboard.config = config

    await db.commit()
    return {"message": "Widget removed"}
