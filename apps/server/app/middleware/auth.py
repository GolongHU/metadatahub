from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.schemas.auth import AuthenticatedUser
from app.services.token_service import decode_access_token

_bearer = HTTPBearer(auto_error=True)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> AuthenticatedUser:
    """FastAPI dependency: validate Bearer token → return AuthenticatedUser."""
    token = credentials.credentials
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return AuthenticatedUser(
        user_id=uuid.UUID(payload["sub"]),
        jti=payload["jti"],
        name=payload["name"],
        email=payload["email"],
        role=payload["role"],
        region=payload.get("region"),
        partner_id=payload.get("partner_id"),
        department=payload.get("department"),
        datasets=payload.get("datasets", []),
        pv=payload["pv"],
        scope_desc=payload.get("scope_desc", ""),
    )
