from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.dataset import Dataset
from app.models.permission import DatasetAccess, RlsRule
from app.models.user import User
from app.schemas.admin import (
    CreateAccessRequest,
    CreateRlsRuleRequest,
    CreateUserRequest,
    DatasetAccessItem,
    RlsRuleItem,
    UpdateRlsRuleRequest,
    UpdateUserRequest,
    UserListItem,
    UserListResponse,
)
from app.schemas.auth import AuthenticatedUser
from app.services.permission_map import require_admin
from app.services.token_service import hash_password

router = APIRouter(prefix="/admin", tags=["admin"])

VALID_ROLES = {"admin", "analyst", "viewer", "partner"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _bump_pv(user: User) -> None:
    """Increment permission_version when role/region/partner changes."""
    user.permission_version = (user.permission_version or 1) + 1


async def _get_dataset_or_404(dataset_id: uuid.UUID, db: AsyncSession) -> Dataset:
    result = await db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.is_active == True)  # noqa: E712
    )
    dataset = result.scalar_one_or_none()
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    return dataset


# ── User management ───────────────────────────────────────────────────────────

@router.get("/users", response_model=UserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: AuthenticatedUser = Depends(require_admin),
) -> UserListResponse:
    offset = (page - 1) * page_size

    count_result = await db.execute(select(func.count()).select_from(User))
    total = count_result.scalar_one()

    result = await db.execute(
        select(User).order_by(User.created_at.desc()).offset(offset).limit(page_size)
    )
    users = result.scalars().all()

    return UserListResponse(
        items=[UserListItem.model_validate(u) for u in users],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/users", response_model=UserListItem, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: CreateUserRequest,
    db: AsyncSession = Depends(get_db),
    _: AuthenticatedUser = Depends(require_admin),
) -> UserListItem:
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=422, detail=f"Invalid role. Must be one of: {VALID_ROLES}")

    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=body.email,
        name=body.name,
        password_hash=hash_password(body.password),
        role=body.role,
        region=body.region,
        department=body.department,
        partner_id=body.partner_id,
        permission_version=1,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserListItem.model_validate(user)


@router.put("/users/{user_id}", response_model=UserListItem)
async def update_user(
    user_id: uuid.UUID,
    body: UpdateUserRequest,
    db: AsyncSession = Depends(get_db),
    _: AuthenticatedUser = Depends(require_admin),
) -> UserListItem:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    pv_fields_changed = False

    if body.name is not None:
        user.name = body.name
    if body.role is not None:
        if body.role not in VALID_ROLES:
            raise HTTPException(status_code=422, detail=f"Invalid role: {body.role}")
        if body.role != user.role:
            user.role = body.role
            pv_fields_changed = True
    if body.region is not None:
        if body.region != user.region:
            user.region = body.region
            pv_fields_changed = True
    if body.department is not None:
        user.department = body.department
    if body.partner_id is not None:
        if body.partner_id != user.partner_id:
            user.partner_id = body.partner_id
            pv_fields_changed = True
    if body.is_active is not None:
        user.is_active = body.is_active

    if pv_fields_changed:
        _bump_pv(user)

    await db.commit()
    await db.refresh(user)
    return UserListItem.model_validate(user)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_admin),
) -> None:
    if user_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = False
    await db.commit()


# ── Dataset access control ────────────────────────────────────────────────────

@router.get("/datasets/{dataset_id}/access", response_model=list[DatasetAccessItem])
async def list_access(
    dataset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: AuthenticatedUser = Depends(require_admin),
) -> list[DatasetAccessItem]:
    await _get_dataset_or_404(dataset_id, db)
    result = await db.execute(
        select(DatasetAccess).where(DatasetAccess.dataset_id == dataset_id)
    )
    return [DatasetAccessItem.model_validate(r) for r in result.scalars().all()]


@router.post(
    "/datasets/{dataset_id}/access",
    response_model=DatasetAccessItem,
    status_code=status.HTTP_201_CREATED,
)
async def add_access(
    dataset_id: uuid.UUID,
    body: CreateAccessRequest,
    db: AsyncSession = Depends(get_db),
    _: AuthenticatedUser = Depends(require_admin),
) -> DatasetAccessItem:
    await _get_dataset_or_404(dataset_id, db)

    if body.grantee_type not in ("role", "user"):
        raise HTTPException(status_code=422, detail="grantee_type must be 'role' or 'user'")

    record = DatasetAccess(
        dataset_id=dataset_id,
        grantee_type=body.grantee_type,
        grantee_id=body.grantee_id,
        access_level=body.access_level,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return DatasetAccessItem.model_validate(record)


@router.delete("/datasets/{dataset_id}/access/{access_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_access(
    dataset_id: uuid.UUID,
    access_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: AuthenticatedUser = Depends(require_admin),
) -> None:
    result = await db.execute(
        select(DatasetAccess).where(
            DatasetAccess.id == access_id,
            DatasetAccess.dataset_id == dataset_id,
        )
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="Access record not found")
    await db.delete(record)
    await db.commit()


# ── RLS rules ─────────────────────────────────────────────────────────────────

@router.get("/datasets/{dataset_id}/rls-rules", response_model=list[RlsRuleItem])
async def list_rls_rules(
    dataset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: AuthenticatedUser = Depends(require_admin),
) -> list[RlsRuleItem]:
    await _get_dataset_or_404(dataset_id, db)
    result = await db.execute(
        select(RlsRule).where(RlsRule.dataset_id == dataset_id).order_by(RlsRule.created_at)
    )
    return [RlsRuleItem.model_validate(r) for r in result.scalars().all()]


@router.post(
    "/datasets/{dataset_id}/rls-rules",
    response_model=RlsRuleItem,
    status_code=status.HTTP_201_CREATED,
)
async def create_rls_rule(
    dataset_id: uuid.UUID,
    body: CreateRlsRuleRequest,
    db: AsyncSession = Depends(get_db),
    _: AuthenticatedUser = Depends(require_admin),
) -> RlsRuleItem:
    await _get_dataset_or_404(dataset_id, db)

    rule = RlsRule(
        dataset_id=dataset_id,
        name=body.name,
        description=body.description,
        condition_type=body.condition_type,
        field=body.field,
        operator=body.operator,
        value_source=body.value_source,
        applies_to_roles=body.applies_to_roles,
        exempt_roles=body.exempt_roles,
        is_active=True,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return RlsRuleItem.model_validate(rule)


@router.put("/rls-rules/{rule_id}", response_model=RlsRuleItem)
async def update_rls_rule(
    rule_id: uuid.UUID,
    body: UpdateRlsRuleRequest,
    db: AsyncSession = Depends(get_db),
    _: AuthenticatedUser = Depends(require_admin),
) -> RlsRuleItem:
    result = await db.execute(select(RlsRule).where(RlsRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=404, detail="RLS rule not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(rule, field, value)

    await db.commit()
    await db.refresh(rule)
    return RlsRuleItem.model_validate(rule)


@router.delete("/rls-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rls_rule(
    rule_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: AuthenticatedUser = Depends(require_admin),
) -> None:
    result = await db.execute(select(RlsRule).where(RlsRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=404, detail="RLS rule not found")
    await db.delete(rule)
    await db.commit()
