from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class WidgetPosition(BaseModel):
    row: int = 0
    col: int = 0
    col_span: int = 1
    row_span: int = 1


class WidgetConfig(BaseModel):
    id: str
    type: str  # kpi_card, line_chart, bar_chart, pie_chart, radar_chart, ranking_table, heatmap, alert_list, action_items
    position: WidgetPosition
    config: dict[str, Any] = Field(default_factory=dict)
    title: str = ""


class TemplateLayout(BaseModel):
    columns: int = 6
    row_height: int = 160  # px


class TemplateConfig(BaseModel):
    layout: TemplateLayout = Field(default_factory=TemplateLayout)
    widgets: list[WidgetConfig] = Field(default_factory=list)
    filters: list[dict[str, Any]] = Field(default_factory=list)


class TemplateCreate(BaseModel):
    name: str
    dataset_ids: list[UUID] = Field(default_factory=list)
    config: TemplateConfig
    assigned_roles: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    template_type: str = "custom"


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    config: Optional[TemplateConfig] = None
    assigned_roles: Optional[list[str]] = None
    tags: Optional[list[str]] = None
    is_published: Optional[bool] = None


class TemplateOut(BaseModel):
    id: UUID
    name: str
    template_type: str
    assigned_roles: list[str]
    tags: list[str]
    version: int
    is_published: bool
    thumbnail_url: Optional[str]
    config: dict[str, Any]
    created_by: Optional[UUID]
    created_at: datetime
    updated_at: datetime
    widget_count: int

    model_config = {"from_attributes": True}


class TemplateDetail(TemplateOut):
    source_dataset_ids: list[UUID]


class CloneRequest(BaseModel):
    new_name: str
    assigned_roles: list[str] = Field(default_factory=list)


class RenderRequest(BaseModel):
    filters: dict[str, Any] = Field(default_factory=dict)


class WidgetRenderResult(BaseModel):
    widget_id: str
    data: Optional[dict[str, Any]] = None
    error: Optional[str] = None


class RenderResponse(BaseModel):
    template_id: UUID
    widgets: dict[str, Any]  # widget_id -> {columns, rows, ...} or error


class WidgetLibraryOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    category: str
    config_schema: dict[str, Any]
    default_config: Optional[dict[str, Any]]
    sort_order: int

    model_config = {"from_attributes": True}


class MarketplaceListItem(BaseModel):
    id: UUID
    name: str
    tags: list[str]
    version: int
    thumbnail_url: Optional[str]
    widget_count: int
    created_at: datetime

    model_config = {"from_attributes": True}
