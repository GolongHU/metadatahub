from __future__ import annotations

import re
import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.permission import ColumnMask, DatasetAccess, RlsRule
from app.schemas.auth import AuthenticatedUser

# ── Value sanitiser ───────────────────────────────────────────────────────────
# Allow Chinese characters, ASCII word chars, spaces, hyphens, dots, @
_SAFE_VALUE_RE = re.compile(r"^[\u4e00-\u9fff\w\s\-\.@（）()]+$")


def _escape_value(v: str) -> str:
    """
    Validate and escape a user-attribute value before SQL interpolation.
    Raises ValueError on suspicious input.
    """
    v = v.strip()
    if not v:
        raise ValueError("Empty value")
    if not _SAFE_VALUE_RE.match(v):
        raise ValueError(f"Value contains unsafe characters: {v!r}")
    return v.replace("'", "''")  # Standard SQL single-quote escaping


# ── Permission Resolver ───────────────────────────────────────────────────────

class PermissionResolver:
    """
    Resolves row-level security and column masking for a query.

    Usage:
        resolver = PermissionResolver(db)
        result = await resolver.resolve(user, dataset_id, ai_sql)
        # result = {"sql": final_sql, "masked_columns": [...]}
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def resolve(
        self,
        user: AuthenticatedUser,
        dataset_id: uuid.UUID,
        base_sql: str,
        table_name: str = "",
    ) -> dict:
        # Step 1 — Check dataset-level access
        await self._check_dataset_access(user, dataset_id)

        # Step 2 — Load active RLS rules for this dataset
        # Step 3 — Filter rules applicable to current user
        applicable_rules = await self._get_applicable_rules(user, dataset_id)

        # Step 4 & 5 — Inject RLS filter at source table level (works with aggregates)
        final_sql, clauses_debug = self._apply_rls(base_sql, applicable_rules, user, table_name)

        # Step 6 — Determine masked columns
        masked = await self._get_masked_columns(dataset_id, user.role)

        return {
            "sql": final_sql,
            "masked_columns": masked,
            "rls_clauses": clauses_debug,  # for debug_sql field
        }

    # ── Step 1 ─────────────────────────────────────────────────────────────────

    async def _check_dataset_access(
        self, user: AuthenticatedUser, dataset_id: uuid.UUID
    ) -> None:
        if user.role == "admin":
            return  # admin always has access

        # Check role-based grant
        role_result = await self.db.execute(
            select(DatasetAccess).where(
                DatasetAccess.dataset_id == dataset_id,
                DatasetAccess.grantee_type == "role",
                DatasetAccess.grantee_id == user.role,
            )
        )
        if role_result.scalars().first() is not None:
            return

        # Check user-specific grant
        user_result = await self.db.execute(
            select(DatasetAccess).where(
                DatasetAccess.dataset_id == dataset_id,
                DatasetAccess.grantee_type == "user",
                DatasetAccess.grantee_id == str(user.user_id),
            )
        )
        if user_result.scalars().first() is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this dataset",
            )

    # ── Step 2 & 3 ─────────────────────────────────────────────────────────────

    async def _get_applicable_rules(
        self, user: AuthenticatedUser, dataset_id: uuid.UUID
    ) -> list[RlsRule]:
        result = await self.db.execute(
            select(RlsRule).where(
                RlsRule.dataset_id == dataset_id,
                RlsRule.is_active == True,  # noqa: E712
            )
        )
        rules = result.scalars().all()

        applicable = []
        for rule in rules:
            # Skip if user role is exempt
            if user.role in (rule.exempt_roles or []):
                continue
            # Skip if rule targets specific roles and this role isn't one of them
            if rule.applies_to_roles and user.role not in rule.applies_to_roles:
                continue
            applicable.append(rule)

        return applicable

    # ── Step 4 & 5 ─────────────────────────────────────────────────────────────

    def _apply_rls(
        self,
        base_sql: str,
        rules: list[RlsRule],
        user: AuthenticatedUser,
        table_name: str = "",
    ) -> tuple[str, list[str]]:
        clauses: list[str] = []

        for rule in rules:
            if rule.condition_type in ("attribute_match", "self_match"):
                attr_name = rule.value_source.replace("user.", "", 1)
                value = getattr(user, attr_name, None)

                if not value:
                    # User doesn't have this attribute → deny everything for safety
                    clauses.append("1=0")
                    continue

                try:
                    safe_val = _escape_value(str(value))
                except ValueError:
                    clauses.append("1=0")
                    continue

                field = rule.field
                if rule.operator == "eq":
                    clauses.append(f'"{field}" = \'{safe_val}\'')
                elif rule.operator == "not_eq":
                    clauses.append(f'"{field}" != \'{safe_val}\'')
                elif rule.operator == "like":
                    clauses.append(f'"{field}" LIKE \'%{safe_val}%\'')
                elif rule.operator == "in":
                    clauses.append(f'"{field}" = \'{safe_val}\'')

            elif rule.condition_type == "value_list":
                try:
                    values = [
                        f"'{_escape_value(v.strip())}'"
                        for v in rule.value_source.split(",")
                        if v.strip()
                    ]
                except ValueError:
                    clauses.append("1=0")
                    continue
                if values:
                    clauses.append(f'"{rule.field}" IN ({", ".join(values)})')

        if not clauses:
            return base_sql, []

        where = " AND ".join(f"({c})" for c in clauses)

        if table_name:
            # Inject filter at source table level so aggregates still work:
            # SELECT COUNT(*) FROM (SELECT * FROM table WHERE rls) AS table
            filtered = f"(SELECT * FROM {table_name} WHERE {where}) AS {table_name}"
            final_sql = re.sub(rf"\b{re.escape(table_name)}\b", filtered, base_sql)
        else:
            # Fallback: CTE wrapping
            final_sql = f"WITH __base AS ({base_sql}) SELECT * FROM __base WHERE {where}"

        return final_sql, clauses

    # ── Step 6 ─────────────────────────────────────────────────────────────────

    async def _get_masked_columns(
        self, dataset_id: uuid.UUID, role: str
    ) -> list[dict]:
        result = await self.db.execute(
            select(ColumnMask).where(
                ColumnMask.dataset_id == dataset_id,
                ColumnMask.is_active == True,  # noqa: E712
            )
        )
        masks = result.scalars().all()

        masked = []
        for mask in masks:
            if role in (mask.exempt_roles or []):
                continue
            if mask.applies_to_roles and role not in mask.applies_to_roles:
                continue
            masked.append({"column": mask.column_name, "mask_type": mask.mask_type})

        return masked
