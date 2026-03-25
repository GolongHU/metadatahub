from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text

from app.database import get_db
from app.middleware.auth import get_current_user
from app.schemas.auth import AuthenticatedUser
from app.schemas.partner import (
    AdminDashboardData,
    RegionDashboardData,
    ManagerDashboardData,
    SelfDashboardData,
    PartnerDetailData,
    KPISummary,
    TierCount,
    RegionComparison,
    MonthlyPoint,
    RiskAlert,
    PartnerRankRow,
    ManagerComparison,
    ActionItem,
    PartnerHealthCard,
    DimDetail,
    ImprovementSuggestion,
    MetricRow,
    DimSection,
)
from app.models.partner import Partner, PartnerMetric, OrgStructure, MetricVisibility

router = APIRouter(tags=["partner"])

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

LATEST_PERIOD = "2025-03"
PREV_PERIOD = "2025-02"

ALL_PERIODS = [
    "2024-04", "2024-05", "2024-06", "2024-07", "2024-08", "2024-09",
    "2024-10", "2024-11", "2024-12", "2025-01", "2025-02", "2025-03",
]

DIM_LABELS: dict[str, str] = {
    "performance": "业绩贡献度",
    "growth": "增长驱动力",
    "engagement": "合作紧密度",
    "health": "运营健康度",
    "activity": "生态活跃度",
}

WEIGHTS: dict[str, float] = {
    "performance": 0.30,
    "growth": 0.20,
    "engagement": 0.20,
    "health": 0.20,
    "activity": 0.10,
}

DIM_SCORING: dict[str, list[tuple[str, float, str]]] = {
    "performance": [
        ("crm_revenue", 0.4, "higher"),
        ("collection_rate", 0.4, "higher"),
        ("order_count", 0.2, "higher"),
    ],
    "growth": [
        ("yoy_growth_rate", 0.4, "higher"),
        ("new_customer_ratio", 0.3, "higher"),
        ("innovation_ratio", 0.3, "higher"),
    ],
    "engagement": [
        ("lead_count", 0.4, "higher"),
        ("certified_count", 0.3, "higher"),
        ("lead_priority_ratio", 0.3, "higher"),
    ],
    "health": [
        ("timely_collection_rate", 0.4, "higher"),
        ("overdue_ratio", 0.3, "lower"),
        ("invoice_health_days", 0.3, "lower"),
    ],
    "activity": [
        ("mall_login_freq", 0.3, "higher"),
        ("cttalk_freq", 0.35, "higher"),
        ("kb_access_freq", 0.35, "higher"),
    ],
}

# Tiers ordered from lowest to highest (must match partners.tier values in DB)
TIER_ORDER = ["risk", "observation", "growth", "core", "strategic"]

# Minimum score to be in this tier (score >= threshold => tier)
TIER_THRESHOLDS: dict[str, float] = {
    "strategic": 8.5,
    "core": 7.0,
    "growth": 5.0,
    "observation": 3.5,
    "risk": 0.0,
}

METRIC_DISPLAY: dict[str, dict[str, str]] = {
    "crm_revenue": {"name": "CRM营收", "unit": "万元"},
    "collection_rate": {"name": "回款率", "unit": "%"},
    "order_count": {"name": "订单数", "unit": "单"},
    "yoy_growth_rate": {"name": "同比增长率", "unit": "%"},
    "new_customer_ratio": {"name": "新客占比", "unit": "%"},
    "innovation_ratio": {"name": "创新产品占比", "unit": "%"},
    "lead_count": {"name": "线索数", "unit": "条"},
    "certified_count": {"name": "认证人数", "unit": "人"},
    "lead_priority_ratio": {"name": "高优线索占比", "unit": "%"},
    "timely_collection_rate": {"name": "及时回款率", "unit": "%"},
    "overdue_ratio": {"name": "逾期率", "unit": "%"},
    "invoice_health_days": {"name": "发票健康天数", "unit": "天"},
    "mall_login_freq": {"name": "商城登录频次", "unit": "次/月"},
    "cttalk_freq": {"name": "CTTalk频次", "unit": "次/月"},
    "kb_access_freq": {"name": "知识库访问", "unit": "次/月"},
}


# ---------------------------------------------------------------------------
# Score computation helpers
# ---------------------------------------------------------------------------

def _percentile_rank(value: float, all_values: list[float], direction: str) -> float:
    """Return 0-100 percentile rank for a value among a list."""
    if not all_values:
        return 50.0
    if direction == "higher":
        below = sum(1 for v in all_values if v < value)
    else:
        # lower is better: more partners with higher value means you rank better
        below = sum(1 for v in all_values if v > value)
    return (below / len(all_values)) * 100.0


def _compute_dim_scores(
    partner_ids: list[str],
    metrics_by_partner: dict[str, dict[str, float]],
) -> dict[str, dict[str, float]]:
    """
    Compute per-dimension scores (0-10) for each partner.

    Returns: {partner_id: {dim: score}}
    """
    # Pre-compute all-partner value lists per metric for percentile computation
    metric_all_values: dict[str, list[float]] = {}
    for _dim, metric_list in DIM_SCORING.items():
        for metric_key, _weight, _direction in metric_list:
            if metric_key not in metric_all_values:
                metric_all_values[metric_key] = [
                    metrics_by_partner[pid][metric_key]
                    for pid in partner_ids
                    if pid in metrics_by_partner and metric_key in metrics_by_partner[pid]
                ]

    result: dict[str, dict[str, float]] = {}
    for pid in partner_ids:
        partner_metrics = metrics_by_partner.get(pid, {})
        dim_scores: dict[str, float] = {}
        for dim, metric_list in DIM_SCORING.items():
            weighted_sum = 0.0
            weight_total = 0.0
            for metric_key, weight, direction in metric_list:
                if metric_key not in partner_metrics:
                    continue
                val = partner_metrics[metric_key]
                all_vals = metric_all_values.get(metric_key, [])
                pct = _percentile_rank(val, all_vals, direction)
                score_0_10 = pct / 10.0
                weighted_sum += score_0_10 * weight
                weight_total += weight
            dim_scores[dim] = (weighted_sum / weight_total) if weight_total > 0 else 0.0
        result[pid] = dim_scores
    return result


def _compute_total_score(dim_scores: dict[str, float]) -> float:
    return sum(dim_scores.get(dim, 0.0) * w for dim, w in WEIGHTS.items())


def _assign_tier(score: float) -> str:
    for tier in reversed(TIER_ORDER):  # gold first
        if score >= TIER_THRESHOLDS[tier]:
            return tier
    return "risk"


def _next_tier_info(tier: str, total_score: float) -> tuple[str | None, float | None]:
    tier_idx = TIER_ORDER.index(tier) if tier in TIER_ORDER else 0
    if tier_idx >= len(TIER_ORDER) - 1:
        return None, None
    next_tier = TIER_ORDER[tier_idx + 1]
    threshold = TIER_THRESHOLDS[next_tier]
    return next_tier, max(0.0, threshold - total_score)


def _progress_pct(tier: str, score: float) -> float:
    tier_idx = TIER_ORDER.index(tier) if tier in TIER_ORDER else 0
    tier_min = TIER_THRESHOLDS.get(tier, 0.0)
    if tier_idx >= len(TIER_ORDER) - 1:
        return 100.0
    next_tier = TIER_ORDER[tier_idx + 1]
    tier_max = TIER_THRESHOLDS[next_tier]
    if tier_max <= tier_min:
        return 100.0
    return min(100.0, max(0.0, (score - tier_min) / (tier_max - tier_min) * 100.0))


# ---------------------------------------------------------------------------
# DB fetch helpers
# ---------------------------------------------------------------------------

async def _fetch_all_partners(db: AsyncSession) -> list[Partner]:
    result = await db.execute(select(Partner).where(Partner.is_active == True))
    return list(result.scalars().all())


async def _fetch_metrics_for_period(
    db: AsyncSession,
    period: str,
    partner_ids: list[str] | None = None,
) -> dict[str, dict[str, float]]:
    """Returns {partner_id: {metric_key: value}} for given period."""
    stmt = select(PartnerMetric).where(PartnerMetric.period == period)
    if partner_ids is not None:
        stmt = stmt.where(PartnerMetric.partner_id.in_(partner_ids))
    result = await db.execute(stmt)
    rows = result.scalars().all()
    out: dict[str, dict[str, float]] = {}
    for row in rows:
        pid = str(row.partner_id)
        if pid not in out:
            out[pid] = {}
        out[pid][row.metric_key] = float(row.value)
    return out


async def _fetch_metrics_for_periods(
    db: AsyncSession,
    periods: list[str],
    partner_ids: list[str] | None = None,
) -> dict[str, dict[str, dict[str, float]]]:
    """Returns {period: {partner_id: {metric_key: value}}}."""
    stmt = select(PartnerMetric).where(PartnerMetric.period.in_(periods))
    if partner_ids is not None:
        stmt = stmt.where(PartnerMetric.partner_id.in_(partner_ids))
    result = await db.execute(stmt)
    rows = result.scalars().all()
    out: dict[str, dict[str, dict[str, float]]] = {}
    for row in rows:
        period = row.period
        pid = str(row.partner_id)
        if period not in out:
            out[period] = {}
        if pid not in out[period]:
            out[period][pid] = {}
        out[period][pid][row.metric_key] = float(row.value)
    return out


async def _fetch_org_structure(db: AsyncSession) -> list[OrgStructure]:
    result = await db.execute(select(OrgStructure))
    return list(result.scalars().all())


async def _fetch_metric_visibility(db: AsyncSession, role: str) -> set[str]:
    """Return set of visible metric_keys for given role."""
    result = await db.execute(
        select(MetricVisibility.metric_key).where(
            MetricVisibility.role == role,
            MetricVisibility.is_visible == True,
        )
    )
    rows = result.all()
    if not rows:
        # If no visibility rules configured, default to showing all metrics
        return set(METRIC_DISPLAY.keys())
    return {row[0] for row in rows}


# ---------------------------------------------------------------------------
# Shared computation helpers
# ---------------------------------------------------------------------------

def _build_manager_map(
    partners: list[Partner],
    org_nodes: list[OrgStructure],
) -> dict[str, str]:
    """Returns {partner_id: manager_name}."""
    manager_by_id: dict[str, str] = {}
    for node in org_nodes:
        if hasattr(node, "org_role") and node.org_role == "partner_manager":
            manager_by_id[str(node.id)] = node.name

    partner_manager: dict[str, str] = {}
    for p in partners:
        pid = str(p.id)
        if hasattr(p, "manager_id") and p.manager_id and str(p.manager_id) in manager_by_id:
            partner_manager[pid] = manager_by_id[str(p.manager_id)]
    return partner_manager


def _build_partner_rank_rows(
    partners: list[Partner],
    dim_scores_map: dict[str, dict[str, float]],
    manager_map: dict[str, str],
    subset_ids: set[str] | None = None,
) -> list[PartnerRankRow]:
    rows = []
    for p in partners:
        pid = str(p.id)
        if subset_ids is not None and pid not in subset_ids:
            continue
        dim = dim_scores_map.get(pid, {})
        total = _compute_total_score(dim)
        rows.append(
            PartnerRankRow(
                rank=0,
                partner_id=pid,
                name=p.name,
                region=p.region,
                manager_name=manager_map.get(pid),
                performance=round(dim.get("performance", 0.0), 2),
                growth=round(dim.get("growth", 0.0), 2),
                engagement=round(dim.get("engagement", 0.0), 2),
                health=round(dim.get("health", 0.0), 2),
                activity=round(dim.get("activity", 0.0), 2),
                total_score=round(total, 2),
                tier=_assign_tier(total),
                tier_change="stable",
            )
        )
    rows.sort(key=lambda r: r.total_score, reverse=True)
    for i, row in enumerate(rows):
        row.rank = i + 1
    return rows


def _build_monthly_trend(
    periods_metrics: dict[str, dict[str, dict[str, float]]],
    all_partner_ids: list[str],
    subset_ids: set[str] | None = None,
    regions_of_partner: dict[str, str] | None = None,
) -> list[MonthlyPoint]:
    points = []
    target_ids = subset_ids if subset_ids is not None else set(all_partner_ids)
    for period in ALL_PERIODS:
        period_data = periods_metrics.get(period, {})
        period_partner_ids = [pid for pid in target_ids if pid in period_data]
        if not period_partner_ids:
            points.append(MonthlyPoint(period=period, avg_score=0.0, by_region={}))
            continue

        # Compute scores using all partners present in this period for accurate percentiles
        all_pids_this_period = list(period_data.keys())
        dim_scores = _compute_dim_scores(all_pids_this_period, period_data)

        totals = [_compute_total_score(dim_scores.get(pid, {})) for pid in period_partner_ids]
        avg = sum(totals) / len(totals) if totals else 0.0

        by_region: dict[str, list[float]] = {}
        if regions_of_partner:
            for pid in period_partner_ids:
                region = regions_of_partner.get(pid, "unknown")
                score = _compute_total_score(dim_scores.get(pid, {}))
                by_region.setdefault(region, []).append(score)
        by_region_avg = {r: round(sum(v) / len(v), 2) for r, v in by_region.items()}

        points.append(
            MonthlyPoint(period=period, avg_score=round(avg, 2), by_region=by_region_avg)
        )
    return points


def _build_kpis(
    partners: list[Partner],
    latest_metrics: dict[str, dict[str, float]],
    dim_scores_map: dict[str, dict[str, float]],
    subset_ids: set[str] | None = None,
) -> KPISummary:
    target = [p for p in partners if subset_ids is None or str(p.id) in subset_ids]
    total_revenue = 0.0
    collection_rates: list[float] = []
    scores: list[float] = []
    risk_count = 0
    obs_count = 0

    for p in target:
        pid = str(p.id)
        m = latest_metrics.get(pid, {})
        total_revenue += m.get("crm_revenue", 0.0)
        if "collection_rate" in m:
            collection_rates.append(m["collection_rate"])
        dim = dim_scores_map.get(pid, {})
        total = _compute_total_score(dim)
        scores.append(total)
        tier = _assign_tier(total)
        if tier == "risk":
            risk_count += 1
        elif tier == "observation":
            obs_count += 1

    avg_score = sum(scores) / len(scores) if scores else 0.0
    avg_collection = sum(collection_rates) / len(collection_rates) if collection_rates else 0.0

    return KPISummary(
        total_revenue=round(total_revenue, 2),
        avg_score=round(avg_score, 2),
        active_partners=len(target),
        risk_partners=risk_count,
        observation_partners=obs_count,
        collection_rate=round(avg_collection, 2),
    )


def _build_tier_distribution(
    partners: list[Partner],
    dim_scores_map: dict[str, dict[str, float]],
    subset_ids: set[str] | None = None,
) -> list[TierCount]:
    target = [p for p in partners if subset_ids is None or str(p.id) in subset_ids]
    tier_counts: dict[str, int] = {t: 0 for t in TIER_ORDER}
    for p in target:
        pid = str(p.id)
        dim = dim_scores_map.get(pid, {})
        total = _compute_total_score(dim)
        tier = _assign_tier(total)
        tier_counts[tier] = tier_counts.get(tier, 0) + 1
    total_partners = len(target)
    return [
        TierCount(
            tier=tier,
            count=tier_counts.get(tier, 0),
            pct=round(tier_counts.get(tier, 0) / total_partners * 100, 1) if total_partners else 0.0,
        )
        for tier in TIER_ORDER
    ]


def _build_radar_global(
    partner_ids: list[str],
    dim_scores_map: dict[str, dict[str, float]],
) -> dict[str, float]:
    if not partner_ids:
        return {dim: 0.0 for dim in DIM_LABELS}
    radar: dict[str, float] = {}
    for dim in DIM_LABELS:
        vals = [dim_scores_map[pid].get(dim, 0.0) for pid in partner_ids if pid in dim_scores_map]
        radar[dim] = round(sum(vals) / len(vals), 2) if vals else 0.0
    return radar


def _build_region_comparison(
    partners: list[Partner],
    latest_metrics: dict[str, dict[str, float]],
    dim_scores_map: dict[str, dict[str, float]],
) -> list[RegionComparison]:
    region_data: dict[str, dict[str, Any]] = {}
    for p in partners:
        pid = str(p.id)
        region = p.region
        if region not in region_data:
            region_data[region] = {"scores": [], "revenue": 0.0, "count": 0}
        dim = dim_scores_map.get(pid, {})
        total = _compute_total_score(dim)
        region_data[region]["scores"].append(total)
        region_data[region]["revenue"] += latest_metrics.get(pid, {}).get("crm_revenue", 0.0)
        region_data[region]["count"] += 1

    result = [
        RegionComparison(
            region=region,
            avg_score=round(sum(data["scores"]) / len(data["scores"]), 2) if data["scores"] else 0.0,
            partner_count=data["count"],
            total_revenue=round(data["revenue"], 2),
        )
        for region, data in region_data.items()
    ]
    result.sort(key=lambda r: r.avg_score, reverse=True)
    return result


def _build_risk_alerts(
    partners: list[Partner],
    dim_scores_map: dict[str, dict[str, float]],
    manager_map: dict[str, str],
    subset_ids: set[str] | None = None,
) -> list[RiskAlert]:
    alerts = []
    for p in partners:
        pid = str(p.id)
        if subset_ids is not None and pid not in subset_ids:
            continue
        dim = dim_scores_map.get(pid, {})
        total = _compute_total_score(dim)
        tier = _assign_tier(total)
        if tier in ("risk", "observation"):
            alerts.append(
                RiskAlert(
                    partner_id=pid,
                    partner_name=p.name,
                    region=p.region,
                    tier=tier,
                    score=round(total, 2),
                    manager_name=manager_map.get(pid),
                )
            )
    alerts.sort(key=lambda a: a.score)
    return alerts


def _build_key_metrics(
    metrics: dict[str, float],
    prev_metrics: dict[str, float],
    keys: list[str] | None = None,
) -> list[dict]:
    if keys is None:
        keys = ["crm_revenue", "collection_rate", "yoy_growth_rate", "lead_count", "timely_collection_rate"]
    result = []
    for key in keys:
        if key not in metrics:
            continue
        val = metrics[key]
        prev_val = prev_metrics.get(key, val)
        change_pct = ((val - prev_val) / prev_val * 100) if prev_val and prev_val != 0 else 0.0
        trend = "up" if change_pct > 0 else ("down" if change_pct < 0 else "stable")
        meta = METRIC_DISPLAY.get(key, {"name": key, "unit": ""})
        result.append({
            "key": key,
            "name": meta["name"],
            "value": round(val, 2),
            "unit": meta["unit"],
            "trend": trend,
            "change_pct": round(change_pct, 2),
        })
    return result


def _build_manager_comparison(
    partners: list[Partner],
    latest_metrics: dict[str, dict[str, float]],
    dim_scores_map: dict[str, dict[str, float]],
    manager_map: dict[str, str],
) -> list[ManagerComparison]:
    mgr_data: dict[str, dict[str, Any]] = {}
    for p in partners:
        pid = str(p.id)
        mgr = manager_map.get(pid, "未分配")
        if mgr not in mgr_data:
            mgr_data[mgr] = {"scores": [], "revenue": 0.0, "count": 0}
        dim = dim_scores_map.get(pid, {})
        total = _compute_total_score(dim)
        mgr_data[mgr]["scores"].append(total)
        mgr_data[mgr]["revenue"] += latest_metrics.get(pid, {}).get("crm_revenue", 0.0)
        mgr_data[mgr]["count"] += 1

    result = [
        ManagerComparison(
            manager_name=mgr_name,
            partner_count=data["count"],
            avg_score=round(sum(data["scores"]) / len(data["scores"]), 2) if data["scores"] else 0.0,
            total_revenue=round(data["revenue"], 2),
        )
        for mgr_name, data in mgr_data.items()
    ]
    result.sort(key=lambda m: m.avg_score, reverse=True)
    return result


def _build_action_items(
    partners: list[Partner],
    dim_scores_map: dict[str, dict[str, float]],
) -> list[ActionItem]:
    items = []
    for p in partners:
        pid = str(p.id)
        dim = dim_scores_map.get(pid, {})
        for dimension, label in DIM_LABELS.items():
            score = dim.get(dimension, 0.0)
            if score < 3.0:
                items.append(
                    ActionItem(
                        partner_name=p.name,
                        dimension=dimension,
                        message=f"{p.name} 在{label}维度得分偏低（{score:.1f}），建议重点跟进",
                        severity="warning",
                    )
                )
            elif score < 5.0:
                items.append(
                    ActionItem(
                        partner_name=p.name,
                        dimension=dimension,
                        message=f"{p.name} 在{label}维度有提升空间（{score:.1f}）",
                        severity="info",
                    )
                )
    items.sort(key=lambda x: (x.severity == "warning", x.severity == "info"), reverse=True)
    return items[:20]


async def _build_dim_details(
    partner_id: str,
    all_partner_ids: list[str],
    latest_metrics: dict[str, dict[str, float]],
    prev_metrics: dict[str, dict[str, float]],
    all_dim_scores: dict[str, dict[str, float]],
    visible_metrics: set[str],
) -> list[DimDetail]:
    my_metrics = latest_metrics.get(partner_id, {})
    my_prev_metrics = prev_metrics.get(partner_id, {})
    my_dim = all_dim_scores.get(partner_id, {})

    prev_pids = list(prev_metrics.keys())
    prev_dim_scores = _compute_dim_scores(prev_pids, prev_metrics)
    my_prev_dim = prev_dim_scores.get(partner_id, {})

    details = []
    for dimension, label in DIM_LABELS.items():
        score = my_dim.get(dimension, 0.0)
        prev_score = my_prev_dim.get(dimension, 0.0)
        change = round(score - prev_score, 2)

        dim_vals = [all_dim_scores[pid].get(dimension, 0.0) for pid in all_partner_ids if pid in all_dim_scores]
        global_avg = round(sum(dim_vals) / len(dim_vals), 2) if dim_vals else 0.0
        below = sum(1 for v in dim_vals if v < score)
        percentile = int(below / len(dim_vals) * 100) if dim_vals else 50

        metrics_detail = []
        for metric_key, _weight, direction in DIM_SCORING.get(dimension, []):
            if metric_key not in visible_metrics:
                continue
            val = my_metrics.get(metric_key)
            if val is None:
                continue
            prev_val = my_prev_metrics.get(metric_key, val)
            change_pct = ((val - prev_val) / prev_val * 100) if prev_val and prev_val != 0 else 0.0
            trend = "up" if change_pct > 0 else ("down" if change_pct < 0 else "stable")
            all_vals = [
                latest_metrics[pid][metric_key]
                for pid in all_partner_ids
                if pid in latest_metrics and metric_key in latest_metrics[pid]
            ]
            pct_rank = _percentile_rank(val, all_vals, direction)
            meta = METRIC_DISPLAY.get(metric_key, {"name": metric_key, "unit": ""})
            metrics_detail.append({
                "key": metric_key,
                "name": meta["name"],
                "value": round(val, 2),
                "unit": meta["unit"],
                "visible": True,
                "trend": trend,
                "change_pct": round(change_pct, 2),
                "percentile": int(pct_rank),
            })

        details.append(
            DimDetail(
                dimension=dimension,
                dim_label=label,
                score=round(score, 2),
                global_avg=global_avg,
                percentile=percentile,
                change=change,
                metrics=metrics_detail,
            )
        )
    return details


def _build_suggestions(
    my_dim: dict[str, float],
    my_metrics: dict[str, float],
) -> list[ImprovementSuggestion]:
    icon_map = {
        "performance": "💰",
        "growth": "📈",
        "engagement": "🤝",
        "health": "🏥",
        "activity": "⚡",
    }
    sorted_dims = sorted(my_dim.items(), key=lambda x: x[1])
    suggestions = []
    for dimension, score in sorted_dims[:3]:
        label = DIM_LABELS[dimension]
        target_score = min(10.0, score + 1.5)
        gain = target_score - score
        expected = gain * WEIGHTS.get(dimension, 0.2)
        suggestions.append(
            ImprovementSuggestion(
                icon=icon_map.get(dimension, "📊"),
                title=f"提升{label}",
                current_value=f"{score:.1f}分",
                target_value=f"{target_score:.1f}分",
                expected_gain=f"+{gain:.1f}分，综合得分预计提升约{expected:.2f}分",
            )
        )
    return suggestions


def _build_dim_sections(
    partner_id: str,
    my_dim: dict[str, float],
    my_metrics: dict[str, float],
    my_prev_metrics: dict[str, float],
    visible_metrics: set[str],
) -> list[DimSection]:
    sections = []
    for dimension, label in DIM_LABELS.items():
        score = my_dim.get(dimension, 0.0)
        metric_rows = []
        for metric_key, _weight, _direction in DIM_SCORING.get(dimension, []):
            if metric_key not in visible_metrics:
                continue
            val = my_metrics.get(metric_key)
            if val is None:
                continue
            prev_val = my_prev_metrics.get(metric_key, val)
            change_pct = ((val - prev_val) / prev_val * 100) if prev_val and prev_val != 0 else 0.0
            trend = "up" if change_pct > 0 else ("down" if change_pct < 0 else "stable")
            meta = METRIC_DISPLAY.get(metric_key, {"name": metric_key, "unit": ""})
            metric_rows.append(
                MetricRow(
                    key=metric_key,
                    name=meta["name"],
                    value=round(val, 2),
                    unit=meta["unit"],
                    trend=trend,
                    change_pct=round(change_pct, 2),
                )
            )
        sections.append(
            DimSection(
                dimension=dimension,
                dim_label=label,
                score=round(score, 2),
                metrics=metric_rows,
            )
        )
    return sections


# ---------------------------------------------------------------------------
# Endpoint 1: Admin dashboard
# ---------------------------------------------------------------------------

@router.get("/partner/dashboard/admin", response_model=AdminDashboardData)
async def admin_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> AdminDashboardData:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")

    try:
        partners = await _fetch_all_partners(db)
        partner_ids = [str(p.id) for p in partners]

        latest_metrics = await _fetch_metrics_for_period(db, LATEST_PERIOD)
        dim_scores_map = _compute_dim_scores(partner_ids, latest_metrics)

        org_nodes = await _fetch_org_structure(db)
        manager_map = _build_manager_map(partners, org_nodes)

        kpis = _build_kpis(partners, latest_metrics, dim_scores_map)
        tier_distribution = _build_tier_distribution(partners, dim_scores_map)
        region_comparison = _build_region_comparison(partners, latest_metrics, dim_scores_map)

        periods_metrics = await _fetch_metrics_for_periods(db, ALL_PERIODS)
        regions_of_partner = {str(p.id): p.region for p in partners}
        monthly_trend = _build_monthly_trend(periods_metrics, partner_ids, None, regions_of_partner)

        risk_alerts = _build_risk_alerts(partners, dim_scores_map, manager_map)
        partner_rankings = _build_partner_rank_rows(partners, dim_scores_map, manager_map)
        radar_global = _build_radar_global(partner_ids, dim_scores_map)

        return AdminDashboardData(
            kpis=kpis,
            tier_distribution=tier_distribution,
            region_comparison=region_comparison,
            monthly_trend=monthly_trend,
            risk_alerts=risk_alerts,
            partner_rankings=partner_rankings,
            radar_global=radar_global,
        )
    except HTTPException:
        raise
    except Exception as exc:
        import logging
        logging.getLogger("metadatahub").error("admin_dashboard error: %s", exc, exc_info=True)
        raise HTTPException(status_code=503, detail=f"数据库查询失败: {type(exc).__name__}: {exc}")


# ---------------------------------------------------------------------------
# Endpoint 2: Region dashboard
# ---------------------------------------------------------------------------

@router.get("/partner/dashboard/region", response_model=RegionDashboardData)
async def region_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> RegionDashboardData:
    if current_user.role not in ("admin", "analyst"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    try:
        all_partners = await _fetch_all_partners(db)

        if current_user.role == "analyst":
            region_filter: str | None = getattr(current_user, "region", None)
            if not region_filter:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="User has no region assigned"
                )
            region_partners = [p for p in all_partners if p.region == region_filter]
        else:
            region_filter = None
            region_partners = all_partners

        all_partner_ids = [str(p.id) for p in all_partners]
        region_partner_ids = [str(p.id) for p in region_partners]

        latest_metrics = await _fetch_metrics_for_period(db, LATEST_PERIOD)

        all_dim_scores = _compute_dim_scores(all_partner_ids, latest_metrics)
        region_dim_scores = {pid: all_dim_scores[pid] for pid in region_partner_ids if pid in all_dim_scores}

        org_nodes = await _fetch_org_structure(db)
        manager_map = _build_manager_map(all_partners, org_nodes)

        kpis = _build_kpis(region_partners, latest_metrics, region_dim_scores)

        all_scores = [_compute_total_score(all_dim_scores[pid]) for pid in all_partner_ids if pid in all_dim_scores]
        global_avg_score = round(sum(all_scores) / len(all_scores), 2) if all_scores else 0.0

        region_comp = _build_region_comparison(all_partners, latest_metrics, all_dim_scores)
        region_rank = 1
        if region_filter:
            for i, rc in enumerate(region_comp):
                if rc.region == region_filter:
                    region_rank = i + 1
                    break

        tier_distribution = _build_tier_distribution(region_partners, region_dim_scores)
        manager_comparison = _build_manager_comparison(
            region_partners, latest_metrics, region_dim_scores, manager_map
        )
        radar_region = _build_radar_global(region_partner_ids, region_dim_scores)
        radar_global = _build_radar_global(all_partner_ids, all_dim_scores)
        action_items = _build_action_items(region_partners, region_dim_scores)
        partner_rankings = _build_partner_rank_rows(region_partners, region_dim_scores, manager_map)

        periods_metrics = await _fetch_metrics_for_periods(db, ALL_PERIODS)
        regions_of_partner = {str(p.id): p.region for p in all_partners}
        monthly_trend = _build_monthly_trend(
            periods_metrics, all_partner_ids, set(region_partner_ids), regions_of_partner
        )

        return RegionDashboardData(
            kpis=kpis,
            global_avg_score=global_avg_score,
            region_rank=region_rank,
            tier_distribution=tier_distribution,
            manager_comparison=manager_comparison,
            radar_region=radar_region,
            radar_global=radar_global,
            action_items=action_items,
            partner_rankings=partner_rankings,
            monthly_trend=monthly_trend,
        )
    except HTTPException:
        raise
    except Exception as exc:
        import logging
        logging.getLogger("metadatahub").error("region_dashboard error: %s", exc, exc_info=True)
        raise HTTPException(status_code=503, detail=f"数据库查询失败: {type(exc).__name__}: {exc}")


# ---------------------------------------------------------------------------
# Endpoint 3: Manager dashboard
# ---------------------------------------------------------------------------

@router.get("/partner/dashboard/manager", response_model=ManagerDashboardData)
async def manager_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> ManagerDashboardData:
    if current_user.role not in ("admin", "viewer"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    try:
        user_id = str(current_user.id)
        org_result = await db.execute(
            select(OrgStructure).where(OrgStructure.user_id == user_id)
        )
        org_node = org_result.scalar_one_or_none()
        if not org_node:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Manager org record not found"
            )

        managed_result = await db.execute(
            select(Partner).where(
                Partner.manager_id == org_node.id,
                Partner.is_active == True,
            )
        )
        managed_partners = list(managed_result.scalars().all())

        if not managed_partners:
            return ManagerDashboardData(
                partners=[],
                manager_name=org_node.name,
                region=getattr(org_node, "region", ""),
            )

        partner_ids = [str(p.id) for p in managed_partners]

        all_partners = await _fetch_all_partners(db)
        all_partner_ids = [str(p.id) for p in all_partners]

        latest_metrics = await _fetch_metrics_for_period(db, LATEST_PERIOD)
        prev_metrics = await _fetch_metrics_for_period(db, PREV_PERIOD)

        all_dim_scores = _compute_dim_scores(all_partner_ids, latest_metrics)

        health_cards = []
        for p in managed_partners:
            pid = str(p.id)
            dim = all_dim_scores.get(pid, {})
            total = _compute_total_score(dim)
            tier = _assign_tier(total)

            m = latest_metrics.get(pid, {})
            prev_m = prev_metrics.get(pid, {})
            key_metrics = _build_key_metrics(m, prev_m)

            alerts = []
            for dimension, label in DIM_LABELS.items():
                score = dim.get(dimension, 0.0)
                if score < 3.0:
                    alerts.append(f"{label}得分偏低（{score:.1f}）")

            health_cards.append(
                PartnerHealthCard(
                    partner_id=pid,
                    name=p.name,
                    tier=tier,
                    total_score=round(total, 2),
                    performance=round(dim.get("performance", 0.0), 2),
                    growth=round(dim.get("growth", 0.0), 2),
                    engagement=round(dim.get("engagement", 0.0), 2),
                    health=round(dim.get("health", 0.0), 2),
                    activity=round(dim.get("activity", 0.0), 2),
                    key_metrics=key_metrics,
                    alerts=alerts,
                )
            )

        health_cards.sort(key=lambda c: c.total_score, reverse=True)

        return ManagerDashboardData(
            partners=health_cards,
            manager_name=org_node.name,
            region=getattr(org_node, "region", ""),
        )
    except HTTPException:
        raise
    except Exception as exc:
        import logging
        logging.getLogger("metadatahub").error("manager_dashboard error: %s", exc, exc_info=True)
        raise HTTPException(status_code=503, detail=f"数据库查询失败: {type(exc).__name__}: {exc}")


# ---------------------------------------------------------------------------
# Endpoint 4: Self dashboard (partner)
# ---------------------------------------------------------------------------

@router.get("/partner/dashboard/self", response_model=SelfDashboardData)
async def self_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> SelfDashboardData:
    if current_user.role != "partner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Partner role required")

    try:
        partner_id = str(getattr(current_user, "partner_id", None) or "")
        if not partner_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="No partner_id in token"
            )

        p_result = await db.execute(select(Partner).where(Partner.id == partner_id))
        partner = p_result.scalar_one_or_none()
        if not partner:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partner not found")

        all_partners = await _fetch_all_partners(db)
        all_partner_ids = [str(p.id) for p in all_partners]

        latest_metrics = await _fetch_metrics_for_period(db, LATEST_PERIOD)
        prev_metrics = await _fetch_metrics_for_period(db, PREV_PERIOD)

        all_dim_scores = _compute_dim_scores(all_partner_ids, latest_metrics)

        my_dim = all_dim_scores.get(partner_id, {dim: 0.0 for dim in DIM_LABELS})
        my_total = _compute_total_score(my_dim)
        my_tier = _assign_tier(my_total)

        all_totals = sorted(
            [(pid, _compute_total_score(all_dim_scores.get(pid, {}))) for pid in all_partner_ids],
            key=lambda x: x[1],
            reverse=True,
        )
        global_rank = next(
            (i + 1 for i, (pid, _) in enumerate(all_totals) if pid == partner_id),
            len(all_totals),
        )

        next_tier, score_to_next = _next_tier_info(my_tier, my_total)
        progress_pct = _progress_pct(my_tier, my_total)

        radar_self = {dim: round(my_dim.get(dim, 0.0), 2) for dim in DIM_LABELS}
        radar_global = _build_radar_global(all_partner_ids, all_dim_scores)

        org_nodes = await _fetch_org_structure(db)
        manager_map = _build_manager_map(all_partners, org_nodes)

        visible_metrics = await _fetch_metric_visibility(db, "partner")
        dimensions = await _build_dim_details(
            partner_id, all_partner_ids, latest_metrics, prev_metrics, all_dim_scores, visible_metrics
        )

        periods_metrics = await _fetch_metrics_for_periods(db, ALL_PERIODS)
        monthly_trend = []
        for period in ALL_PERIODS:
            period_data = periods_metrics.get(period, {})
            if partner_id in period_data:
                pids_for_period = list(period_data.keys())
                dim_scores_period = _compute_dim_scores(pids_for_period, period_data)
                score = _compute_total_score(dim_scores_period.get(partner_id, {}))
            else:
                score = 0.0
            monthly_trend.append({"period": period, "score": round(score, 2)})

        suggestions = _build_suggestions(my_dim, latest_metrics.get(partner_id, {}))

        return SelfDashboardData(
            partner_id=partner_id,
            partner_name=partner.name,
            region=partner.region,
            manager_name=manager_map.get(partner_id),
            tier=my_tier,
            total_score=round(my_total, 2),
            next_tier=next_tier,
            score_to_next=round(score_to_next, 2) if score_to_next is not None else None,
            progress_pct=round(progress_pct, 1),
            global_rank=global_rank,
            total_partners=len(all_partner_ids),
            radar_self=radar_self,
            radar_global=radar_global,
            dimensions=dimensions,
            monthly_trend=monthly_trend,
            suggestions=suggestions,
        )
    except HTTPException:
        raise
    except Exception as exc:
        import logging
        logging.getLogger("metadatahub").error("self_dashboard error: %s", exc, exc_info=True)
        raise HTTPException(status_code=503, detail=f"数据库查询失败: {type(exc).__name__}: {exc}")


# ---------------------------------------------------------------------------
# Endpoint 5: Partner detail
# ---------------------------------------------------------------------------

@router.get("/partner/{partner_id}/detail", response_model=PartnerDetailData)
async def partner_detail(
    partner_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> PartnerDetailData:
    p_result = await db.execute(select(Partner).where(Partner.id == partner_id))
    partner = p_result.scalar_one_or_none()
    if not partner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partner not found")

    if current_user.role == "partner":
        if str(getattr(current_user, "partner_id", None)) != partner_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    all_partners = await _fetch_all_partners(db)
    all_partner_ids = [str(p.id) for p in all_partners]

    latest_metrics = await _fetch_metrics_for_period(db, LATEST_PERIOD)
    prev_metrics = await _fetch_metrics_for_period(db, PREV_PERIOD)

    all_dim_scores = _compute_dim_scores(all_partner_ids, latest_metrics)
    prev_pids = list(prev_metrics.keys())
    prev_dim_scores = _compute_dim_scores(prev_pids, prev_metrics)

    my_dim = all_dim_scores.get(partner_id, {dim: 0.0 for dim in DIM_LABELS})
    my_prev_dim = prev_dim_scores.get(partner_id, {dim: 0.0 for dim in DIM_LABELS})
    my_total = _compute_total_score(my_dim)
    my_prev_total = _compute_total_score(my_prev_dim)
    score_change = round(my_total - my_prev_total, 2)

    org_nodes = await _fetch_org_structure(db)
    manager_map = _build_manager_map(all_partners, org_nodes)

    radar = {dim: round(my_dim.get(dim, 0.0), 2) for dim in DIM_LABELS}

    visible_metrics = await _fetch_metric_visibility(db, current_user.role)

    my_metrics = latest_metrics.get(partner_id, {})
    my_prev_metrics = prev_metrics.get(partner_id, {})
    dimensions = _build_dim_sections(partner_id, my_dim, my_metrics, my_prev_metrics, visible_metrics)

    periods_metrics = await _fetch_metrics_for_periods(db, ALL_PERIODS)
    monthly_trend = []
    for period in ALL_PERIODS:
        period_data = periods_metrics.get(period, {})
        if partner_id in period_data:
            pids_for_period = list(period_data.keys())
            dim_scores_period = _compute_dim_scores(pids_for_period, period_data)
            score = _compute_total_score(dim_scores_period.get(partner_id, {}))
        else:
            score = 0.0
        monthly_trend.append({"period": period, "score": round(score, 2)})

    return PartnerDetailData(
        partner_id=partner_id,
        partner_name=partner.name,
        region=partner.region,
        manager_name=manager_map.get(partner_id),
        tier=_assign_tier(my_total),
        total_score=round(my_total, 2),
        score_change=score_change,
        radar=radar,
        dimensions=dimensions,
        monthly_trend=monthly_trend,
    )
