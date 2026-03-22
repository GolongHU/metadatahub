from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class DashboardListItem(BaseModel):
    id: uuid.UUID
    name: str
    dataset_id: uuid.UUID
    is_default: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class DashboardDetail(BaseModel):
    id: uuid.UUID
    name: str
    dataset_id: uuid.UUID
    config: Dict[str, Any]
    is_default: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AutoGenerateRequest(BaseModel):
    dataset_id: uuid.UUID


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
