"""
Auth unit tests — run without a live database.
Uses AsyncMock to patch the DB layer so we can verify JWT/auth logic directly.
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.services.token_service import (
    create_access_token,
    decode_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)


# ── Token service unit tests ──────────────────────────────────────────────────

def test_create_and_decode_access_token():
    payload = {
        "sub": str(uuid.uuid4()),
        "name": "Test User",
        "email": "test@example.com",
        "role": "admin",
        "region": None,
        "partner_id": None,
        "datasets": [],
        "pv": 1,
        "scope_desc": "全部数据",
    }
    token, expires_in = create_access_token(payload)
    assert isinstance(token, str)
    assert expires_in == 15 * 60  # 15 min in seconds

    decoded = decode_access_token(token)
    assert decoded is not None
    assert decoded["email"] == "test@example.com"
    assert decoded["role"] == "admin"
    assert "jti" in decoded
    assert "exp" in decoded


def test_decode_invalid_token_returns_none():
    result = decode_access_token("totally.invalid.token")
    assert result is None


def test_decode_tampered_token_returns_none():
    payload = {
        "sub": str(uuid.uuid4()),
        "name": "X",
        "email": "x@x.com",
        "role": "admin",
        "region": None,
        "partner_id": None,
        "datasets": [],
        "pv": 1,
        "scope_desc": "",
    }
    token, _ = create_access_token(payload)
    # Tamper with the signature
    parts = token.split(".")
    tampered = parts[0] + "." + parts[1] + ".badsignature"
    assert decode_access_token(tampered) is None


def test_password_hash_and_verify():
    plain = "admin123"
    hashed = hash_password(plain)
    assert hashed != plain
    assert verify_password(plain, hashed)
    assert not verify_password("wrong", hashed)


def test_generate_refresh_token():
    raw, token_hash = generate_refresh_token()
    assert len(raw) > 32
    assert token_hash == hashlib.sha256(raw.encode()).hexdigest()
    assert hash_refresh_token(raw) == token_hash


# ── Auth endpoint integration tests (mocked DB) ───────────────────────────────

@pytest.fixture
def client():
    from app.main import app
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


def _make_user(role: str = "admin") -> MagicMock:
    user = MagicMock()
    user.id = uuid.uuid4()
    user.email = "admin@metadatahub.local"
    user.name = "Admin"
    user.password_hash = hash_password("admin123")
    user.role = role
    user.region = None
    user.partner_id = None
    user.permission_version = 1
    user.is_active = True
    return user


def test_login_success(client):
    mock_user = _make_user()

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_user

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=mock_result)
    mock_session.add = MagicMock()
    mock_session.commit = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    with patch("app.database.AsyncSessionLocal", return_value=mock_session):
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": "admin@metadatahub.local", "password": "admin123"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    # Verify the token is valid
    decoded = decode_access_token(data["access_token"])
    assert decoded is not None
    assert decoded["email"] == "admin@metadatahub.local"
    assert decoded["role"] == "admin"


def test_login_wrong_password(client):
    mock_user = _make_user()

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_user

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=mock_result)
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    with patch("app.database.AsyncSessionLocal", return_value=mock_session):
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": "admin@metadatahub.local", "password": "wrongpass"},
        )

    assert resp.status_code == 401


def test_login_user_not_found(client):
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=mock_result)
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    with patch("app.database.AsyncSessionLocal", return_value=mock_session):
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": "nobody@x.com", "password": "admin123"},
        )

    assert resp.status_code == 401


def test_me_endpoint_with_valid_token(client):
    payload = {
        "sub": str(uuid.uuid4()),
        "name": "Admin",
        "email": "admin@metadatahub.local",
        "role": "admin",
        "region": None,
        "partner_id": None,
        "datasets": [],
        "pv": 1,
        "scope_desc": "全部数据",
    }
    token, _ = create_access_token(payload)

    resp = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "admin@metadatahub.local"
    assert data["role"] == "admin"


def test_me_endpoint_without_token(client):
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code in (401, 403)  # HTTPBearer: 401 (FastAPI 0.100+) or 403 (older)


def test_me_endpoint_with_invalid_token(client):
    resp = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer invalid.token.here"},
    )
    assert resp.status_code == 401
