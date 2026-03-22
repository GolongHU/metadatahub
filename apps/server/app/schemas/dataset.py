from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class ColumnInfo(BaseModel):
    name: str
    type: str  # string | integer | float | date | boolean
    nullable: bool
    null_ratio: float
    distinct_count: int
    sample_values: List[Any]
    min_value: Optional[Any] = None
    max_value: Optional[Any] = None
    description: str = ""


class DatasetSchema(BaseModel):
    columns: List[ColumnInfo]
    row_count: int


class DatasetOut(BaseModel):
    id: uuid.UUID
    name: str
    source_type: str
    row_count: int
    schema_info: Dict[str, Any]
    created_by: Optional[uuid.UUID] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class DatasetListItem(BaseModel):
    id: uuid.UUID
    name: str
    source_type: str
    row_count: int
    column_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class PreviewResponse(BaseModel):
    columns: List[str]
    rows: List[List[Any]]
    total_rows: int
