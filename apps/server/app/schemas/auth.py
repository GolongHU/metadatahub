from __future__ import annotations

import uuid
from typing import List, Optional

from pydantic import BaseModel


class LoginRequest(BaseModel):
    email: str  # plain str — format validated at DB lookup, not at input
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class AuthenticatedUser(BaseModel):
    """Parsed user context extracted from a valid access token."""

    user_id: uuid.UUID
    jti: str
    name: str
    email: str
    role: str
    region: Optional[str] = None
    partner_id: Optional[str] = None
    department: Optional[str] = None
    datasets: List[str] = []
    pv: int
    scope_desc: str = ""
