from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class MessageOut(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    query_sql: Optional[str] = None
    chart_type: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationListItem(BaseModel):
    id: uuid.UUID
    dataset_id: Optional[uuid.UUID] = None
    title: str
    message_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConversationDetail(BaseModel):
    id: uuid.UUID
    dataset_id: Optional[uuid.UUID] = None
    title: str
    messages: List[MessageOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CreateConversationRequest(BaseModel):
    dataset_id: Optional[uuid.UUID] = None
    title: str


class AddMessagesRequest(BaseModel):
    messages: List[Dict[str, Any]]
