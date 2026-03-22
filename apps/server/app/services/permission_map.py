from __future__ import annotations

from fastapi import Depends, HTTPException, status

from app.middleware.auth import get_current_user
from app.schemas.auth import AuthenticatedUser

# ── Role → allowed actions ────────────────────────────────────────────────────

PERMISSION_MAP: dict[str, list[str]] = {
    "admin_users":        ["admin"],
    "manage_datasources": ["admin", "analyst"],
    "upload_data":        ["admin", "analyst"],
    "ai_query":           ["admin", "analyst", "viewer", "partner"],
    "view_dashboard":     ["admin", "analyst", "viewer", "partner"],
    "export_data":        ["admin", "analyst"],
    "admin_permissions":  ["admin"],
}


def has_permission(role: str, action: str) -> bool:
    return role in PERMISSION_MAP.get(action, [])


def require_permission(action: str):
    """FastAPI dependency factory. Usage: Depends(require_permission('upload_data'))"""
    async def _dep(
        current_user: AuthenticatedUser = Depends(get_current_user),
    ) -> AuthenticatedUser:
        if not has_permission(current_user.role, action):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: requires '{action}'",
            )
        return current_user
    return _dep


# Convenience shortcut for admin-only endpoints
require_admin = require_permission("admin_permissions")
