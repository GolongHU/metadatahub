from __future__ import annotations

# Import all models so Alembic autogenerate can discover them
from app.models.dataset import Dataset
from app.models.permission import ColumnMask, DatasetAccess, RlsRule
from app.models.platform import AIProvider, AITaskRouting, PlatformConfig
from app.models.refresh_token import RefreshToken
from app.models.user import User

__all__ = [
    "User", "Dataset", "RefreshToken", "DatasetAccess", "RlsRule", "ColumnMask",
    "PlatformConfig", "AIProvider", "AITaskRouting",
]
