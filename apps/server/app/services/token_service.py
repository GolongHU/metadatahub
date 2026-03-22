from __future__ import annotations

import hashlib
import secrets
import uuid
from typing import Optional
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt

from app.config import settings


# ── Access Token ─────────────────────────────────────────────────────────────

def create_access_token(user_data: dict) -> tuple[str, int]:
    """Mint a signed access token. Returns (token, expires_in_seconds)."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.access_token_expire_minutes)

    payload = {
        **user_data,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "jti": str(uuid.uuid4()),
    }
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return token, settings.access_token_expire_minutes * 60


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and verify an access token. Returns payload dict or None on failure."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        return payload
    except JWTError:
        return None


# ── Refresh Token ─────────────────────────────────────────────────────────────

def generate_refresh_token() -> tuple[str, str]:
    """Generate a random refresh token. Returns (raw_token, sha256_hash)."""
    raw = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    return raw, token_hash


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def refresh_token_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)


# ── Password ──────────────────────────────────────────────────────────────────

from argon2 import PasswordHasher  # noqa: E402
from argon2.exceptions import VerifyMismatchError  # noqa: E402

_ph = PasswordHasher()


def hash_password(plain: str) -> str:
    return _ph.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, plain)
    except VerifyMismatchError:
        return False
