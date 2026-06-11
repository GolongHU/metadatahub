from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, status
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db, get_duckdb
from app.middleware.auth import get_current_user
from app.models.dataset import Dataset
from app.models.html_dashboard import HtmlDashboard
from app.schemas.auth import AuthenticatedUser

router = APIRouter(prefix="/html-dashboards", tags=["html-dashboards"])

_BRIDGE_SCRIPT = """
<script>
(function() {
  var _cbs = {};
  var _id = 0;
  window.MetadataHub = {
    query: function(sql, datasetId) {
      return new Promise(function(resolve, reject) {
        var id = ++_id;
        _cbs[id] = { resolve: resolve, reject: reject };
        window.parent.postMessage(
          { type: 'mh-query', id: id, sql: sql, datasetId: datasetId },
          window.location.origin
        );
      });
    }
  };
  window.addEventListener('message', function(e) {
    if (!e.data || e.data.type !== 'mh-result') return;
    var cb = _cbs[e.data.id];
    if (!cb) return;
    delete _cbs[e.data.id];
    if (e.data.error) cb.reject(new Error(e.data.error));
    else cb.resolve(e.data.result);
  });
})();
</script>
"""


def _serialize(dash: HtmlDashboard) -> Dict[str, Any]:
    return {
        "id": str(dash.id),
        "name": dash.name,
        "description": dash.description,
        "dataset_ids": dash.dataset_ids or [],
        "init_function_name": dash.init_function_name,
        "created_by": str(dash.created_by) if dash.created_by else None,
        "created_at": dash.created_at.isoformat(),
    }


# ── GET /html-dashboards ──────────────────────────────────────────────────────

@router.get("", response_model=List[Dict[str, Any]])
async def list_html_dashboards(
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    result = await db.execute(
        select(HtmlDashboard)
        .where(HtmlDashboard.is_active == True)  # noqa: E712
        .order_by(HtmlDashboard.created_at.desc())
    )
    return [_serialize(d) for d in result.scalars().all()]


# ── POST /html-dashboards/upload ──────────────────────────────────────────────

@router.post("/upload", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def upload_html_dashboard(
    file: UploadFile,
    name: str = Form(...),
    description: Optional[str] = Form(None),
    dataset_ids: str = Form("[]"),
    init_function_name: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Dict[str, Any]:
    import json

    if not (file.filename or "").lower().endswith(".html"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .html files are allowed",
        )

    try:
        ids: List[str] = json.loads(dataset_ids)
    except (ValueError, TypeError):
        ids = []

    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_id = uuid.uuid4()
    file_path = upload_dir / f"html_{file_id}.html"

    content = await file.read()
    file_path.write_bytes(content)

    dash = HtmlDashboard(
        name=name,
        description=description or None,
        file_path=str(file_path),
        dataset_ids=ids,
        init_function_name=init_function_name,
        created_by=current_user.user_id if isinstance(current_user.user_id, uuid.UUID) else uuid.UUID(str(current_user.user_id)),
    )
    db.add(dash)
    await db.commit()
    await db.refresh(dash)
    return _serialize(dash)


# ── GET /html-dashboards/{id} ─────────────────────────────────────────────────

@router.get("/{dashboard_id}", response_model=Dict[str, Any])
async def get_html_dashboard(
    dashboard_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Dict[str, Any]:
    dash = await _get_active(dashboard_id, db)
    return _serialize(dash)


# ── PATCH /html-dashboards/{id} ──────────────────────────────────────────────

@router.patch("/{dashboard_id}", response_model=Dict[str, Any])
async def update_html_dashboard(
    dashboard_id: uuid.UUID,
    body: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Dict[str, Any]:
    """更新看板绑定的数据集和初始化函数名。"""
    dash = await _get_active(dashboard_id, db)
    if "dataset_ids" in body:
        dash.dataset_ids = body["dataset_ids"]
    if "init_function_name" in body:
        dash.init_function_name = body["init_function_name"] or None
    if "name" in body and body["name"]:
        dash.name = body["name"]
    if "description" in body:
        dash.description = body["description"] or None
    await db.commit()
    await db.refresh(dash)
    return _serialize(dash)


# ── DELETE /html-dashboards/{id} ──────────────────────────────────────────────

@router.delete("/{dashboard_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_html_dashboard(
    dashboard_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> None:
    dash = await _get_active(dashboard_id, db)
    dash.is_active = False
    await db.commit()


# ── GET /html-dashboards/{id}/view  (no auth — served into iframe) ────────────

@router.get("/{dashboard_id}/view", response_class=HTMLResponse, include_in_schema=False)
async def view_html_dashboard(
    dashboard_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    """Serve the uploaded HTML with bridge script and pre-loaded dataset data injected."""
    dash = await _get_active(dashboard_id, db)

    html_path = Path(dash.file_path)
    if not html_path.exists():
        raise HTTPException(status_code=404, detail="HTML file not found on disk")

    html = html_path.read_text(encoding="utf-8", errors="replace")

    data_script = await _build_data_script(dash.dataset_ids or [], db, dash.init_function_name)
    inject = data_script + "\n" + _BRIDGE_SCRIPT

    if "</head>" in html:
        html = html.replace("</head>", f"{inject}\n</head>", 1)
    else:
        html = inject + "\n" + html

    return HTMLResponse(content=html)


async def _build_data_script(dataset_ids: List[str], db: AsyncSession, init_function_name: Optional[str] = None) -> str:
    """Query bound datasets from DuckDB and return a <script> that injects the data and optionally calls init function."""
    if not dataset_ids:
        return "<script>window.MH_DATASETS={};window.MH_DATA={};</script>"

    valid_ids: List[uuid.UUID] = []
    for raw in dataset_ids:
        try:
            valid_ids.append(uuid.UUID(str(raw)))
        except (ValueError, AttributeError):
            pass

    if not valid_ids:
        return "<script>window.MH_DATASETS={};window.MH_DATA={};</script>"

    result = await db.execute(
        select(Dataset.id, Dataset.name).where(
            Dataset.id.in_(valid_ids),
            Dataset.is_active == True,  # noqa: E712
        )
    )
    rows_pg = result.all()

    datasets_payload: Dict[str, Any] = {}
    for ds_id, ds_name in rows_pg:
        table_name = f"dataset_{ds_id.hex}"
        try:
            conn = get_duckdb()
            rel = conn.execute(f'SELECT * FROM "{table_name}" LIMIT 50000')
            columns = [desc[0] for desc in rel.description]
            rows = []
            for row in rel.fetchall():
                rows.append([_json_safe(v) for v in row])
            datasets_payload[str(ds_id)] = {
                "name": ds_name,
                "columns": columns,
                "rows": rows,
            }
        except Exception:
            datasets_payload[str(ds_id)] = {
                "name": ds_name,
                "columns": [],
                "rows": [],
            }

    mh_data_entries = ", ".join(
        f"{json.dumps(v['name'])}: window.MH_DATASETS[{json.dumps(k)}]"
        for k, v in datasets_payload.items()
    )
    payload_json = json.dumps(datasets_payload, ensure_ascii=False)

    script = (
        f"<script>\n"
        f"window.MH_DATASETS = {payload_json};\n"
        f"window.MH_DATA = {{{mh_data_entries}}};\n"
    )

    if init_function_name:
        script += (
            f"(function() {{\n"
            f"  function autoInit() {{\n"
            f"    if (typeof {init_function_name} !== 'function') return;\n"
            f"    try {{\n"
            f"      var firstDatasetId = Object.keys(window.MH_DATASETS)[0];\n"
            f"      if (!firstDatasetId) return;\n"
            f"      var ds = window.MH_DATASETS[firstDatasetId];\n"
            f"      if (!ds.rows || ds.rows.length === 0) return;\n"
            f"      var records = ds.rows.map(function(row) {{\n"
            f"        var obj = {{}};\n"
            f"        ds.columns.forEach(function(col, i) {{ obj[col] = row[i]; }});\n"
            f"        return obj;\n"
            f"      }});\n"
            f"      {init_function_name}(records);\n"
            f"    }} catch(e) {{\n"
            f"      console.warn('[MetadataHub] Auto-init error:', e.message);\n"
            f"    }}\n"
            f"  }}\n"
            f"  if (document.readyState === 'complete') {{\n"
            f"    autoInit();\n"
            f"  }} else {{\n"
            f"    window.addEventListener('load', autoInit);\n"
            f"  }}\n"
            f"}})();\n"
        )

    script += "</script>"
    return script


def _json_safe(v: Any) -> Any:
    """Convert non-JSON-serialisable types to safe primitives."""
    import datetime, decimal
    if isinstance(v, (datetime.date, datetime.datetime)):
        return v.isoformat()
    if isinstance(v, decimal.Decimal):
        return float(v)
    if isinstance(v, (bytes, bytearray)):
        return v.decode("utf-8", errors="replace")
    return v


# ── helpers ───────────────────────────────────────────────────────────────────

async def _get_active(dashboard_id: uuid.UUID, db: AsyncSession) -> HtmlDashboard:
    result = await db.execute(
        select(HtmlDashboard).where(
            HtmlDashboard.id == dashboard_id,
            HtmlDashboard.is_active == True,  # noqa: E712
        )
    )
    dash = result.scalar_one_or_none()
    if dash is None:
        raise HTTPException(status_code=404, detail="HTML dashboard not found")
    return dash
