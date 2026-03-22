from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.auth import AuthenticatedUser, LoginRequest, TokenResponse
from app.schemas.user import UserOut
from app.services.token_service import (
    create_access_token,
    generate_refresh_token,
    hash_refresh_token,
    refresh_token_expiry,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

_REFRESH_COOKIE = "refresh_token"


def _build_access_payload(user: User) -> dict:
    """Build the access token payload from a User ORM object."""
    return {
        "sub": str(user.id),
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "region": user.region,
        "partner_id": user.partner_id,
        "department": user.department,
        "datasets": [],  # populated in Phase 2 from dataset ACL
        "pv": user.permission_version,
        "scope_desc": _scope_desc(user),
    }


def _scope_desc(user: User) -> str:
    """Human-readable scope description injected into AI prompts."""
    if user.role == "admin":
        return "全部数据"
    if user.role == "partner" and user.partner_id:
        return f"仅限 {user.partner_id} 数据"
    if user.region:
        return f"{user.region}区域数据"
    if user.role == "viewer":
        return "受限范围"
    return "授权范围内数据"


def _set_refresh_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=raw_token,
        httponly=True,
        secure=False,   # set True in production (HTTPS)
        samesite="lax",
        max_age=60 * 60 * 24 * 7,  # 7 days
        path="/api/v1/auth",
    )


# ── POST /auth/login ──────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    result = await db.execute(
        select(User).where(User.email == body.email, User.is_active == True)  # noqa: E712
    )
    user: User | None = result.scalar_one_or_none()

    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Mint access token
    access_token, expires_in = create_access_token(_build_access_payload(user))

    # Generate + persist refresh token
    raw_rt, rt_hash = generate_refresh_token()
    db.add(
        RefreshToken(
            token_hash=rt_hash,
            user_id=user.id,
            expires_at=refresh_token_expiry(),
            device_info={},
        )
    )
    await db.commit()

    _set_refresh_cookie(response, raw_rt)

    return TokenResponse(access_token=access_token, expires_in=expires_in)


# ── POST /auth/refresh ────────────────────────────────────────────────────────

@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    response: Response,
    refresh_token: Optional[str] = Cookie(default=None, alias=_REFRESH_COOKIE),
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")

    rt_hash = hash_refresh_token(refresh_token)
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == rt_hash,
            RefreshToken.is_revoked == False,  # noqa: E712
        )
    )
    token_record: RefreshToken | None = result.scalar_one_or_none()

    if token_record is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    if token_record.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")

    # Load latest user state (permission_version may have changed)
    user_result = await db.execute(
        select(User).where(User.id == token_record.user_id, User.is_active == True)  # noqa: E712
    )
    user: User | None = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Rotate: revoke old, issue new
    token_record.is_revoked = True
    raw_new, hash_new = generate_refresh_token()
    db.add(
        RefreshToken(
            token_hash=hash_new,
            user_id=user.id,
            expires_at=refresh_token_expiry(),
            device_info=token_record.device_info,
        )
    )
    await db.commit()

    access_token, expires_in = create_access_token(_build_access_payload(user))
    _set_refresh_cookie(response, raw_new)

    return TokenResponse(access_token=access_token, expires_in=expires_in)


# ── POST /auth/logout ─────────────────────────────────────────────────────────

@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    refresh_token: Optional[str] = Cookie(default=None, alias=_REFRESH_COOKIE),
    db: AsyncSession = Depends(get_db),
) -> None:
    if refresh_token:
        rt_hash = hash_refresh_token(refresh_token)
        result = await db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == rt_hash)
        )
        token_record = result.scalar_one_or_none()
        if token_record:
            token_record.is_revoked = True
            await db.commit()

    response.delete_cookie(key=_REFRESH_COOKIE, path="/api/v1/auth")


# ── GET /auth/me ──────────────────────────────────────────────────────────────

@router.get("/me")
async def me(current_user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    return {
        "user_id": str(current_user.user_id),
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "region": current_user.region,
        "partner_id": current_user.partner_id,
        "department": current_user.department,
        "scope_desc": current_user.scope_desc,
    }
