from __future__ import annotations

import asyncio
import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from functools import partial

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.dashboard import DashboardConfig
from app.models.dataset import Dataset
from app.schemas.auth import AuthenticatedUser
from app.schemas.dashboard import (
    AutoGenerateRequest,
    DashboardDetail,
    DashboardListItem,
    DashboardQueryRequest,
    DashboardQueryResponse,
    WidgetResult,
)
from app.schemas.dataset import DatasetSchema
from app.services.dashboard_generator import generate_dashboard_config
from app.services.permission_resolver import PermissionResolver
from app.services.query_executor import execute_query

router = APIRouter(prefix="/dashboards", tags=["dashboards"])

_executor = ThreadPoolExecutor(max_workers=4)

# ── Helpers ───────────────────────────────────────────────────────────────────

_SAFE_FILTER_RE = re.compile(r"^[\u4e00-\u9fff\w\s\-\.@（）()]+$")


def _validate_filter_value(v: str) -> str:
    v = v.strip()
    if not v or not _SAFE_FILTER_RE.match(v):
        raise ValueError(f"Unsafe filter value: {v!r}")
    return v.replace("'", "''")


def _apply_filters_to_query(sql: str, filters: dict[str, str]) -> str:
    if not filters:
        return sql
    clauses = []
    for field, value in filters.items():
        try:
            safe_val = _validate_filter_value(value)
        except ValueError:
            continue
        clauses.append(f'"{field}" = \'{safe_val}\'')
    if not clauses:
        return sql
    where = " AND ".join(clauses)
    return f"WITH __filtered AS ({sql}) SELECT * FROM __filtered WHERE {where}"


async def _get_dataset_or_404(dataset_id: uuid.UUID, db: AsyncSession) -> Dataset:
    result = await db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.is_active == True)  # noqa: E712
    )
    ds = result.scalars().first()
    if ds is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    return ds


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
        sql = raw_query.replace("{table}", table_name)
        sql = _apply_filters_to_query(sql, filters)

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


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[DashboardListItem])
async def list_dashboards(
    db: AsyncSession = Depends(get_db),
    _: AuthenticatedUser = Depends(get_current_user),
) -> list[DashboardListItem]:
    result = await db.execute(
        select(DashboardConfig).order_by(DashboardConfig.created_at.desc())
    )
    return [DashboardListItem.model_validate(d) for d in result.scalars().all()]


@router.get("/{dashboard_id}", response_model=DashboardDetail)
async def get_dashboard(
    dashboard_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: AuthenticatedUser = Depends(get_current_user),
) -> DashboardDetail:
    result = await db.execute(
        select(DashboardConfig).where(DashboardConfig.id == dashboard_id)
    )
    dashboard = result.scalars().first()
    if dashboard is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dashboard not found")
    return DashboardDetail.model_validate(dashboard)


@router.post("/{dashboard_id}/query", response_model=DashboardQueryResponse)
async def query_dashboard(
    dashboard_id: uuid.UUID,
    body: DashboardQueryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> DashboardQueryResponse:
    result = await db.execute(
        select(DashboardConfig).where(DashboardConfig.id == dashboard_id)
    )
    dashboard = result.scalars().first()
    if dashboard is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dashboard not found")

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


@router.post("/auto-generate", response_model=DashboardDetail)
async def auto_generate_dashboard(
    body: AutoGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> DashboardDetail:
    dataset = await _get_dataset_or_404(body.dataset_id, db)
    schema = DatasetSchema(**dataset.schema_info)
    table_name = f"dataset_{dataset.id.hex}"

    config = generate_dashboard_config(
        dataset_name=dataset.name,
        dataset_id=str(dataset.id),
        schema=schema,
        table_name=table_name,
    )

    # Deactivate existing defaults for this dataset
    existing = await db.execute(
        select(DashboardConfig).where(
            DashboardConfig.dataset_id == body.dataset_id,
            DashboardConfig.is_default == True,  # noqa: E712
        )
    )
    for old in existing.scalars().all():
        old.is_default = False

    dashboard = DashboardConfig(
        name=config["title"],
        dataset_id=body.dataset_id,
        config=config,
        is_default=True,
        created_by=current_user.user_id,
    )
    db.add(dashboard)
    await db.commit()
    await db.refresh(dashboard)
    return DashboardDetail.model_validate(dashboard)
