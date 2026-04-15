from __future__ import annotations

import asyncio
import uuid
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_, select, text
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
    ImportTemplateRequest,
    ImportTemplateResponse,
    UpdateDashboardRequest,
    WidgetResult,
)
from app.schemas.dataset import DatasetSchema
from app.services.dashboard_generator import generate_dashboard_config, generate_smart_dashboard, generate_from_plan
from app.services.data_profiler import profile_dataset
from app.services.data_interpreter import interpret_dataset
from app.services.data_analyst import propose_analysis
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
    dataset_id: Optional[uuid.UUID],
    db: AsyncSession,
) -> tuple[str, WidgetResult]:
    try:
        if dataset_id is None:
            # PostgreSQL path: system dashboards query PG tables directly
            import time
            t0 = time.time()
            pg_result = await db.execute(text(raw_query))
            columns = list(pg_result.keys())
            rows_out = []
            for row in pg_result.fetchall()[:500]:
                rows_out.append([
                    float(v) if hasattr(v, '__float__') and not isinstance(v, (int, float, str, bool, type(None))) else v
                    for v in row
                ])
            return widget_id, WidgetResult(
                columns=columns,
                rows=rows_out,
                row_count=len(rows_out),
                execution_time_ms=(time.time() - t0) * 1000,
            )

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
    dataset_ids = {d.dataset_id for d in dashboards if d.dataset_id is not None}
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
            dataset_name=dataset_names.get(d.dataset_id, "") if d.dataset_id else "",
            dashboard_type=d.dashboard_type,
            is_pinned=d.is_pinned,
            widget_count=len(d.config.get("widgets", [])),
            updated_at=d.updated_at,
        )
        for d in dashboards
    ]


# ── Import from Template ──────────────────────────────────────────────────────

@router.post("/import-template", response_model=ImportTemplateResponse)
async def import_template(
    body: ImportTemplateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> ImportTemplateResponse:
    import copy

    # Load template
    tmpl_result = await db.execute(
        select(DashboardConfig).where(
            DashboardConfig.id == body.template_id,
            DashboardConfig.dashboard_type == "template",
        )
    )
    template = tmpl_result.scalars().first()
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")

    # Deep-copy config
    config = copy.deepcopy(template.config or {})

    # Resolve duckdb table name and substitute {table}
    resolved_table_name = ""
    if body.dataset_id is not None:
        ds_result = await db.execute(
            select(Dataset).where(Dataset.id == body.dataset_id)
        )
        dataset = ds_result.scalars().first()
        if dataset:
            resolved_table_name = getattr(dataset, "duckdb_table_name", None) or f"dataset_{dataset.id.hex}"
            for widget in config.get("widgets", []):
                widget_cfg = widget.get("config", {})
                if "query" in widget_cfg:
                    widget_cfg["query"] = widget_cfg["query"].replace("{table}", f'"{resolved_table_name}"')

    # ── Normalize template widget format → dashboard widget format ──────────────
    # Template:  widget.config.query, type="kpi_card"/"bar_chart"/...
    # Dashboard: widget.query (top-level), type="kpi"/"chart" + chart_type
    _TEMPLATE_TYPE_MAP: dict[str, tuple[str, str | None]] = {
        "kpi_card":       ("kpi",   None),
        "bar_chart":      ("chart", "bar"),
        "line_chart":     ("chart", "line"),
        "pie_chart":      ("chart", "pie"),
        "radar_chart":    ("chart", "bar"),
        "ranking_table":  ("chart", "table"),
        "alert_list":     ("chart", "table"),
        "action_items":   ("chart", "table"),
    }
    for widget in config.get("widgets", []):
        widget_cfg = widget.get("config", {})
        # Hoist query from config.query → widget.query
        if "query" not in widget and "query" in widget_cfg:
            widget["query"] = widget_cfg["query"]
        # Normalize type
        raw_type = widget.get("type", "")
        if raw_type in _TEMPLATE_TYPE_MAP:
            norm_type, chart_type = _TEMPLATE_TYPE_MAP[raw_type]
            widget["type"] = norm_type
            if chart_type and "chart_type" not in widget:
                widget["chart_type"] = chart_type
        # Normalize position keys (col_span → width, row_span → height)
        pos = widget.get("position", {})
        if "col_span" in pos and "width" not in pos:
            pos["width"] = pos.pop("col_span")
        if "row_span" in pos and "height" not in pos:
            pos["height"] = pos.pop("row_span")

    # Re-pack widget positions into a 6-column grid by original row order.
    # Template editor stores all widgets at col=0 with sequential rows,
    # relying on CSS auto-flow for visual layout. We need to compute actual
    # col/row positions so the dashboard renderer groups them correctly.
    GRID_COLS = 6
    widgets_sorted = sorted(config.get("widgets", []), key=lambda w: w.get("position", {}).get("row", 0))
    virtual_row = 0
    current_col = 0
    for widget in widgets_sorted:
        pos = widget.get("position", {})
        width = pos.get("width", 3)
        if width > GRID_COLS:
            width = GRID_COLS
        if current_col + width > GRID_COLS:
            virtual_row += 1
            current_col = 0
        pos["row"] = virtual_row
        pos["col"] = current_col
        current_col += width
        if current_col >= GRID_COLS:
            virtual_row += 1
            current_col = 0

    # Set top-level table_name so query_dashboard can use it for RLS/filter injection
    config["table_name"] = resolved_table_name
    if body.dataset_id is not None:
        config["dataset_id"] = str(body.dataset_id)

    dashboard_name = (body.name or "").strip() or template.name
    user_id = current_user.user_id if isinstance(current_user.user_id, uuid.UUID) else uuid.UUID(str(current_user.user_id))

    new_dashboard = DashboardConfig(
        id=uuid.uuid4(),
        name=dashboard_name,
        dataset_id=body.dataset_id,
        config=config,
        dashboard_type="personal",
        owner_id=user_id,
        is_pinned=False,
        sort_order=0,
    )
    db.add(new_dashboard)
    await db.commit()
    await db.refresh(new_dashboard)

    return ImportTemplateResponse(
        id=new_dashboard.id,
        name=new_dashboard.name,
        message="看板创建成功",
    )


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

    table_name = f"dataset_{dataset.id.hex}"
    schema_info = dataset.schema_info or {}
    schema_fields = schema_info.get("columns", [])

    # ── Step 1: 尝试读取缓存的 AI 解读 ──────────────────────────────────────
    from app.services.data_interpreter import DataInterpretation, FieldSemantic, KpiSpec, ChartSpec

    interpretation = None
    if dataset.ai_interpretation:
        try:
            raw = dataset.ai_interpretation
            interpretation = DataInterpretation(
                business_domain=raw.get("business_domain", ""),
                table_purpose=raw.get("table_purpose", ""),
                narrative_mode=raw.get("narrative_mode", "mixed"),
                narrative_reason=raw.get("narrative_reason", ""),
                key_questions=raw.get("key_questions", []),
                key_insights=raw.get("key_insights", []),
                fields_semantic=[
                    FieldSemantic(**f) for f in raw.get("fields_semantic", [])
                ],
                recommended_kpis=[
                    KpiSpec(**k) for k in raw.get("recommended_kpis", [])
                ],
                recommended_charts=[
                    ChartSpec(**c) for c in raw.get("recommended_charts", [])
                ],
                color_mapping=raw.get("color_mapping", {}),
                time_field=raw.get("time_field"),
            )
        except Exception:
            interpretation = None

    # ── Step 2: 无缓存 → 做画像 + AI 理解 ───────────────────────────────────
    if interpretation is None:
        try:
            profile = await profile_dataset(
                dataset_id=str(body.dataset_id),
                table_name=table_name,
                schema_fields=schema_fields,
            )

            # 获取样本数据
            import asyncio
            from concurrent.futures import ThreadPoolExecutor
            from functools import partial
            from app.database import get_duckdb

            def _fetch_samples():
                conn = get_duckdb()
                rows = conn.execute(f'SELECT * FROM "{table_name}" LIMIT 20').fetchall()
                cols = [d[0] for d in conn.description] if rows else []
                return [dict(zip(cols, r)) for r in rows]

            with ThreadPoolExecutor(max_workers=1) as ex:
                sample_rows = await asyncio.get_event_loop().run_in_executor(ex, _fetch_samples)

            interpretation = await interpret_dataset(profile, dataset.name, sample_rows, db)

            # 缓存到 datasets 表
            cache_dict = {
                "business_domain": interpretation.business_domain,
                "table_purpose": interpretation.table_purpose,
                "narrative_mode": interpretation.narrative_mode,
                "narrative_reason": interpretation.narrative_reason,
                "key_questions": interpretation.key_questions,
                "key_insights": interpretation.key_insights,
                "fields_semantic": [
                    {"name": f.name, "chinese_name": f.chinese_name,
                     "semantic_role": f.semantic_role, "business_meaning": f.business_meaning,
                     "importance": f.importance, "format_hint": f.format_hint}
                    for f in interpretation.fields_semantic
                ],
                "recommended_kpis": [
                    {"title": k.title, "field": k.field, "aggregation": k.aggregation,
                     "filter": k.filter, "comparison": k.comparison, "format": k.format}
                    for k in interpretation.recommended_kpis
                ],
                "recommended_charts": [
                    {"purpose": c.purpose, "type": c.type, "x_field": c.x_field,
                     "y_field": c.y_field, "group_by": c.group_by, "title": c.title}
                    for c in interpretation.recommended_charts
                ],
                "color_mapping": interpretation.color_mapping,
                "time_field": interpretation.time_field,
            }
            dataset.ai_interpretation = cache_dict
        except Exception as e:
            # AI 理解失败，降级到旧的模板匹配方式
            schema = DatasetSchema(**schema_info)
            config = generate_dashboard_config(
                dataset_name=dataset.name,
                dataset_id=str(dataset.id),
                schema=schema,
                table_name=table_name,
            )
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

    # ── Step 3: 基于 AI 理解生成看板 ─────────────────────────────────────────
    config = await generate_smart_dashboard(dataset, interpretation, db)

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
        name=interpretation.business_domain or f"{dataset.name} 数据看板",
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


@router.post("/datasets/{dataset_id}/reanalyze", status_code=status.HTTP_200_OK)
async def reanalyze_dataset(
    dataset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    """清除数据集的 AI 解读缓存，下次生成看板将重新分析。"""
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    dataset = result.scalars().first()
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    dataset.ai_interpretation = None
    await db.commit()
    return {"status": "ok", "message": "已清除缓存，下次生成看板将重新分析"}


# ── Create personal dashboard ─────────────────────────────────────────────────

@router.post("", response_model=DashboardDetail, status_code=status.HTTP_201_CREATED)
async def create_dashboard(
    body: CreateDashboardRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> DashboardDetail:
    user_id = current_user.user_id if isinstance(current_user.user_id, uuid.UUID) else uuid.UUID(str(current_user.user_id))
    table_name = f"dataset_{body.dataset_id.hex}" if body.dataset_id else ""
    config = body.config or {
        "title": body.name,
        "dataset_id": str(body.dataset_id) if body.dataset_id else None,
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


# ── AI 分析师工作流 ────────────────────────────────────────────────────────────

from pydantic import BaseModel as _BaseModel


class ProposeRequest(_BaseModel):
    dataset_id: uuid.UUID
    user_followup: Optional[str] = None
    previous_plan: Optional[dict] = None


class GenerateFromPlanRequest(_BaseModel):
    dataset_id: uuid.UUID
    plan: dict
    selected_angle_ids: list[str]


@router.post("/propose")
async def propose_dashboard(
    body: ProposeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    """Step 1: AI 分析师读数据，生成分析方案（角度 + 提议 widgets）。"""
    result = await db.execute(
        select(Dataset).where(Dataset.id == body.dataset_id, Dataset.is_active == True)  # noqa: E712
    )
    dataset = result.scalars().first()
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")

    table_name    = f"dataset_{dataset.id.hex}"
    schema_info   = dataset.schema_info or {}
    schema_fields = schema_info.get("columns", [])

    # 数据画像
    profile = await profile_dataset(
        dataset_id=str(body.dataset_id),
        table_name=table_name,
        schema_fields=schema_fields,
    )

    # 获取样本行
    def _fetch_samples():
        from app.database import get_duckdb
        conn = get_duckdb()
        rows = conn.execute(f'SELECT * FROM "{table_name}" LIMIT 10').fetchall()
        if not rows:
            return []
        desc = conn.description
        cols = [d[0] for d in desc] if desc else []
        return [dict(zip(cols, r)) for r in rows]

    loop = asyncio.get_event_loop()
    sample_rows = await loop.run_in_executor(_executor, _fetch_samples)

    # AI 分析
    plan = await propose_analysis(
        profile=profile,
        dataset_name=dataset.name,
        sample_rows=sample_rows,
        db=db,
        user_followup=body.user_followup,
        previous_plan=body.previous_plan,
    )

    return {
        "data_understanding": plan.data_understanding,
        "angles": [
            {
                "id": a.id,
                "title": a.title,
                "business_question": a.business_question,
                "reasoning": a.reasoning,
                "is_recommended": a.is_recommended,
                "proposed_widgets": [
                    {
                        "title": w.title,
                        "chart_type": w.chart_type,
                        "purpose": w.purpose,
                        "sql_hint": w.sql_hint,
                        "col_span": w.col_span,
                    }
                    for w in a.proposed_widgets
                ],
            }
            for a in plan.angles
        ],
    }


@router.post("/generate-from-plan", response_model=DashboardDetail)
async def generate_dashboard_from_plan(
    body: GenerateFromPlanRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> DashboardDetail:
    """Step 2: 根据用户选定的角度，AI 生成每个 widget 的 SQL，写入看板。"""
    result = await db.execute(
        select(Dataset).where(Dataset.id == body.dataset_id, Dataset.is_active == True)  # noqa: E712
    )
    dataset = result.scalars().first()
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")

    config = await generate_from_plan(
        dataset=dataset,
        plan_dict=body.plan,
        selected_angle_ids=body.selected_angle_ids,
        db=db,
    )

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
