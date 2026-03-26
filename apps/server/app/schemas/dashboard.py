from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class DashboardListItem(BaseModel):
    id: uuid.UUID
    name: str
    dataset_id: Optional[uuid.UUID] = None
    dataset_name: str = ""
    dashboard_type: str = "auto"
    is_pinned: bool = False
    widget_count: int = 0
    updated_at: datetime

    model_config = {"from_attributes": True}


class DashboardDetail(BaseModel):
    id: uuid.UUID
    name: str
    dataset_id: Optional[uuid.UUID] = None
    config: Dict[str, Any]
    dashboard_type: str = "auto"
    owner_id: Optional[uuid.UUID] = None
    is_pinned: bool = False
    is_default: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AutoGenerateRequest(BaseModel):
    dataset_id: uuid.UUID


class CreateDashboardRequest(BaseModel):
    name: str
    dataset_id: Optional[uuid.UUID] = None
    config: Optional[Dict[str, Any]] = None


class UpdateDashboardRequest(BaseModel):
    name: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    is_pinned: Optional[bool] = None


class AddWidgetRequest(BaseModel):
    type: str  # 'kpi' | 'chart'
    chart_type: Optional[str] = None
    title: str
    query: str
    position: Optional[Dict[str, int]] = None
    format: Optional[str] = None


class DashboardQueryRequest(BaseModel):
    filters: Optional[Dict[str, str]] = None


class WidgetResult(BaseModel):
    columns: List[str]
    rows: List[List[Any]]
    row_count: int
    execution_time_ms: float
    error: Optional[str] = None


class DashboardQueryResponse(BaseModel):
    widgets: Dict[str, WidgetResult]


class ImportTemplateRequest(BaseModel):
    template_id: uuid.UUID
    dataset_id: Optional[uuid.UUID] = None
    name: Optional[str] = None


class ImportTemplateResponse(BaseModel):
    id: uuid.UUID
    name: str
    message: str


class SaveToDashboardRequest(BaseModel):
    dashboard_id: Optional[uuid.UUID] = None
    new_dashboard_name: Optional[str] = None
    dataset_id: uuid.UUID
    title: str
    sql: str
    chart_type: str
    explanation: Optional[str] = None


class SaveToDashboardResponse(BaseModel):
    dashboard_id: uuid.UUID
    widget_id: str
    dashboard_name: str
