from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DatasetAccess(Base):
    """Dataset-level access control — who can see which dataset."""

    __tablename__ = "dataset_access"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    grantee_type: Mapped[str] = mapped_column(String(20), nullable=False)   # 'role' | 'user'
    grantee_id: Mapped[str] = mapped_column(String(100), nullable=False)    # role name or user UUID
    access_level: Mapped[str] = mapped_column(String(20), nullable=False, default="read")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    def __repr__(self) -> str:
        return f"<DatasetAccess dataset={self.dataset_id} {self.grantee_type}={self.grantee_id}>"


class RlsRule(Base):
    """Row-level security rule applied to a dataset."""

    __tablename__ = "rls_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)

    # 'attribute_match' | 'value_list' | 'self_match'
    condition_type: Mapped[str] = mapped_column(String(50), nullable=False)
    field: Mapped[str] = mapped_column(String(100), nullable=False)
    # 'eq' | 'in' | 'like' | 'not_eq'
    operator: Mapped[str] = mapped_column(String(20), nullable=False)
    # e.g. 'user.region', 'user.partner_id', or a JSON-encoded list of values
    value_source: Mapped[str] = mapped_column(Text, nullable=False)

    applies_to_roles: Mapped[list] = mapped_column(ARRAY(String), nullable=False, server_default="{}")
    exempt_roles: Mapped[list] = mapped_column(ARRAY(String), nullable=False, server_default="{admin}")

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    def __repr__(self) -> str:
        return f"<RlsRule dataset={self.dataset_id} field={self.field}>"


class ColumnMask(Base):
    """Column-level masking rule — hide or redact a column for certain roles."""

    __tablename__ = "column_masks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    column_name: Mapped[str] = mapped_column(String(100), nullable=False)
    mask_type: Mapped[str] = mapped_column(String(20), nullable=False)  # 'hide' | 'redact'

    applies_to_roles: Mapped[list] = mapped_column(ARRAY(String), nullable=False, server_default="{}")
    exempt_roles: Mapped[list] = mapped_column(ARRAY(String), nullable=False, server_default="{admin}")

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    def __repr__(self) -> str:
        return f"<ColumnMask dataset={self.dataset_id} col={self.column_name}>"
