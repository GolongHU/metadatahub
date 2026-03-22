from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    role: str
    region: Optional[str] = None
    partner_id: Optional[str] = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
