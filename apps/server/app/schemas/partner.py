from __future__ import annotations
from typing import Optional
from pydantic import BaseModel


class KPISummary(BaseModel):
    total_revenue: float
    avg_score: float
    active_partners: int
    risk_partners: int
    observation_partners: int
    collection_rate: float


class TierCount(BaseModel):
    tier: str
    count: int
    pct: float


class RegionComparison(BaseModel):
    region: str
    avg_score: float
    partner_count: int
    total_revenue: float


class MonthlyPoint(BaseModel):
    period: str
    avg_score: float
    by_region: dict[str, float]


class RiskAlert(BaseModel):
    partner_id: str
    partner_name: str
    region: str
    tier: str
    score: float
    manager_name: Optional[str] = None


class PartnerRankRow(BaseModel):
    rank: int
    partner_id: str
    name: str
    region: str
    manager_name: Optional[str] = None
    performance: float
    growth: float
    engagement: float
    health: float
    activity: float
    total_score: float
    tier: str
    tier_change: str = "stable"


class AdminDashboardData(BaseModel):
    kpis: KPISummary
    tier_distribution: list[TierCount]
    region_comparison: list[RegionComparison]
    monthly_trend: list[MonthlyPoint]
    risk_alerts: list[RiskAlert]
    partner_rankings: list[PartnerRankRow]
    radar_global: dict[str, float]


class ManagerComparison(BaseModel):
    manager_name: str
    partner_count: int
    avg_score: float
    total_revenue: float


class ActionItem(BaseModel):
    partner_name: str
    dimension: str
    message: str
    severity: str  # 'warning' | 'info' | 'ok'


class RegionDashboardData(BaseModel):
    kpis: KPISummary
    global_avg_score: float
    region_rank: int
    tier_distribution: list[TierCount]
    manager_comparison: list[ManagerComparison]
    radar_region: dict[str, float]
    radar_global: dict[str, float]
    action_items: list[ActionItem]
    partner_rankings: list[PartnerRankRow]
    monthly_trend: list[MonthlyPoint]


class PartnerHealthCard(BaseModel):
    partner_id: str
    name: str
    tier: str
    total_score: float
    performance: float
    growth: float
    engagement: float
    health: float
    activity: float
    key_metrics: list[dict]
    alerts: list[str]


class ManagerDashboardData(BaseModel):
    partners: list[PartnerHealthCard]
    manager_name: str
    region: str


class DimDetail(BaseModel):
    dimension: str
    dim_label: str
    score: float
    global_avg: float
    percentile: int
    change: float
    metrics: list[dict]


class ImprovementSuggestion(BaseModel):
    icon: str
    title: str
    current_value: str
    target_value: str
    expected_gain: str


class SelfDashboardData(BaseModel):
    partner_id: str
    partner_name: str
    region: str
    manager_name: Optional[str] = None
    tier: str
    total_score: float
    next_tier: Optional[str] = None
    score_to_next: Optional[float] = None
    progress_pct: float
    global_rank: int
    total_partners: int
    radar_self: dict[str, float]
    radar_global: dict[str, float]
    dimensions: list[DimDetail]
    monthly_trend: list[dict]
    suggestions: list[ImprovementSuggestion]


class MetricRow(BaseModel):
    key: str
    name: str
    value: float
    unit: str
    trend: str   # 'up'|'down'|'stable'
    change_pct: float


class DimSection(BaseModel):
    dimension: str
    dim_label: str
    score: float
    metrics: list[MetricRow]


class PartnerDetailData(BaseModel):
    partner_id: str
    partner_name: str
    region: str
    manager_name: Optional[str] = None
    tier: str
    total_score: float
    score_change: float
    radar: dict[str, float]
    dimensions: list[DimSection]
    monthly_trend: list[dict]
