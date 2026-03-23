from __future__ import annotations

from cryptography.fernet import Fernet

from app.config import settings


def _fernet() -> Fernet:
    return Fernet(settings.encryption_key.encode())


def encrypt_api_key(plain_key: str) -> str:
    return _fernet().encrypt(plain_key.encode()).decode()


def decrypt_api_key(encrypted_key: str) -> str:
    return _fernet().decrypt(encrypted_key.encode()).decode()


def mask_api_key(plain_key: str) -> str:
    """Show only first 4 and last 4 characters."""
    if len(plain_key) <= 12:
        return "****"
    return plain_key[:4] + "*" * (len(plain_key) - 8) + plain_key[-4:]
