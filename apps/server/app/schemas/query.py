from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, field_validator


class AskRequest(BaseModel):
    question: str
    dataset_id: uuid.UUID

    @field_validator("question")
    @classmethod
    def question_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("question must not be empty")
        return v


class QueryData(BaseModel):
    columns: List[str]
    rows: List[List[Any]]
    row_count: int
    execution_time_ms: float


class AskResponse(BaseModel):
    sql: str
    explanation: str
    chart_type: str          # bar | line | pie | table
    data: QueryData
    dataset_id: str
    scope_desc: Optional[str] = None   # human-readable data scope from JWT
    debug_sql: Optional[str] = None    # final SQL after RLS injection (for debugging)


class SafetyResult(BaseModel):
    safe: bool
    reason: Optional[str] = None


class GeneratedSQL(BaseModel):
    sql: str
    explanation: str
    chart_type: str


class QueryResult(BaseModel):
    columns: List[str]
    rows: List[List[Any]]
    row_count: int
    execution_time_ms: float
