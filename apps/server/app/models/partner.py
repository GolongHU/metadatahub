from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Boolean, Date, DateTime, ForeignKey, Numeric, String, Text, func
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class OrgStructure(Base):
    __tablename__ = "org_structure"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False)   # region_head / partner_manager
    region: Mapped[str] = mapped_column(String(50), nullable=False)
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("org_structure.id"), nullable=True
    )
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Partner(Base):
    __tablename__ = "partners"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    short_name: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    region: Mapped[str] = mapped_column(String(50), nullable=False)
    manager_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("org_structure.id"), nullable=True
    )
    tier: Mapped[str] = mapped_column(String(50), nullable=False, default="growth")
    total_score: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False, default=5.0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    joined_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class PartnerMetric(Base):
    __tablename__ = "partner_metrics"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    partner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partners.id"), nullable=False, index=True
    )
    period: Mapped[str] = mapped_column(String(10), nullable=False)        # '2025-03', '2024-Q1'
    period_type: Mapped[str] = mapped_column(String(10), nullable=False)   # 'monthly', 'quarterly'
    dimension: Mapped[str] = mapped_column(String(50), nullable=False)     # 'performance', ...
    metric_key: Mapped[str] = mapped_column(String(100), nullable=False)
    metric_name: Mapped[str] = mapped_column(String(200), nullable=False)
    value: Mapped[float] = mapped_column(Numeric(20, 4), nullable=False)
    unit: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        __import__("sqlalchemy").UniqueConstraint("partner_id", "period", "metric_key",
                                                  name="uq_partner_period_metric"),
    )


class PartnerScore(Base):
    __tablename__ = "partner_scores"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    partner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partners.id"), nullable=False, index=True
    )
    period: Mapped[str] = mapped_column(String(10), nullable=False)
    performance_score: Mapped[Optional[float]] = mapped_column(Numeric(4, 2), nullable=True)
    growth_score: Mapped[Optional[float]] = mapped_column(Numeric(4, 2), nullable=True)
    engagement_score: Mapped[Optional[float]] = mapped_column(Numeric(4, 2), nullable=True)
    health_score: Mapped[Optional[float]] = mapped_column(Numeric(4, 2), nullable=True)
    activity_score: Mapped[Optional[float]] = mapped_column(Numeric(4, 2), nullable=True)
    total_score: Mapped[Optional[float]] = mapped_column(Numeric(4, 2), nullable=True)
    tier: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    tier_change: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    red_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        __import__("sqlalchemy").UniqueConstraint("partner_id", "period",
                                                  name="uq_partner_score_period"),
    )


class MetricVisibility(Base):
    __tablename__ = "metric_visibility"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    metric_key: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    visible_roles: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False)
