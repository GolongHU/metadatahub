from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr


# ── User schemas ──────────────────────────────────────────────────────────────

class UserListItem(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    role: str
    region: Optional[str] = None
    department: Optional[str] = None
    partner_id: Optional[str] = None
    permission_version: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = "viewer"
    region: Optional[str] = None
    department: Optional[str] = None
    partner_id: Optional[str] = None


class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    region: Optional[str] = None
    department: Optional[str] = None
    partner_id: Optional[str] = None
    is_active: Optional[bool] = None


class UserListResponse(BaseModel):
    items: List[UserListItem]
    total: int
    page: int
    page_size: int


# ── Dataset access schemas ────────────────────────────────────────────────────

class DatasetAccessItem(BaseModel):
    id: uuid.UUID
    dataset_id: uuid.UUID
    grantee_type: str
    grantee_id: str
    access_level: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CreateAccessRequest(BaseModel):
    grantee_type: str       # 'role' | 'user'
    grantee_id: str         # role name or user UUID string
    access_level: str = "read"


# ── RLS rule schemas ──────────────────────────────────────────────────────────

class RlsRuleItem(BaseModel):
    id: uuid.UUID
    dataset_id: uuid.UUID
    name: str
    description: Optional[str] = None
    condition_type: str
    field: str
    operator: str
    value_source: str
    applies_to_roles: List[str]
    exempt_roles: List[str]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class CreateRlsRuleRequest(BaseModel):
    name: str
    description: Optional[str] = None
    condition_type: str
    field: str
    operator: str
    value_source: str
    applies_to_roles: List[str] = []
    exempt_roles: List[str] = ["admin"]


class UpdateRlsRuleRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    condition_type: Optional[str] = None
    field: Optional[str] = None
    operator: Optional[str] = None
    value_source: Optional[str] = None
    applies_to_roles: Optional[List[str]] = None
    exempt_roles: Optional[List[str]] = None
    is_active: Optional[bool] = None
