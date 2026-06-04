"""workspace.py — 伙伴经理个人工作台聚合接口"""
from __future__ import annotations

from collections import defaultdict
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.partner import Partner, PartnerProfile
from app.schemas.auth import AuthenticatedUser

router = APIRouter(tags=["workspace"])


def _safe_float(v: Any, default: float = 0.0) -> float:
    try:
        return float(v) if v is not None else default
    except (TypeError, ValueError):
        return default


@router.get("/workspace")
async def workspace_summary(
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    """伙伴经理/运营负责人工作台数据汇总"""
    role   = current_user.role
    uname  = getattr(current_user, "name", "") or ""

    stmt = select(Partner).where(Partner.is_active.is_(True))
    if role == "ops_manager" and uname:
        stmt = stmt.where(Partner.ops_manager == uname)
    elif role == "partner_manager" and uname:
        stmt = stmt.where(Partner.partner_manager == uname)
    elif role not in ("admin", "analyst"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="此页面仅运营负责人/伙伴经理可访问")

    res = await db.execute(stmt.order_by(Partner.total_score.desc()))
    partners = res.scalars().all()
    partner_ids = [str(p.id) for p in partners]

    if not partner_ids:
        return {"stats": {}, "output_trends": [], "recent_events": [], "top_partners": []}

    prof_res = await db.execute(
        select(PartnerProfile).where(PartnerProfile.partner_id.in_(partner_ids))
    )
    profiles = {str(pr.partner_id): pr.profile_data for pr in prof_res.scalars().all()}

    # Stats
    total_revenue = total_deals = total_active = total_reports = 0.0
    for pid in partner_ids:
        kpi = (profiles.get(pid) or {}).get("kpi") or {}
        total_revenue += _safe_float(kpi.get("revenue_total"))
        total_deals   += _safe_float(kpi.get("reports_deal"))
        total_active  += _safe_float(kpi.get("reports_active"))
        total_reports += _safe_float(kpi.get("reports_total"))

    stats = {
        "total_partners":  len(partners),
        "monthly_revenue": round(total_revenue / 10000, 1),
        "active_reports":  int(total_active),
        "deal_rate":       round(total_deals / max(1, total_reports) * 100, 1),
    }

    # 产出趋势（年度汇总）
    year_totals: dict[str, float] = defaultdict(float)
    for p in partners:
        for t in ((profiles.get(str(p.id)) or {}).get("output_trend") or []):
            y = str(t.get("year", ""))
            if y.isdigit() and int(y) >= 2022:
                year_totals[y] += _safe_float(t.get("total"))

    output_trends = [
        {"year": y, "total": round(v / 10000, 1)}
        for y, v in sorted(year_totals.items())
    ]

    # 近期动态（合并所有伙伴，按日期降序）
    all_events: list[dict] = []
    for p in partners:
        for e in ((profiles.get(str(p.id)) or {}).get("recent_events") or [])[:5]:
            all_events.append({
                "partner": p.name,
                "date":    e.get("date", ""),
                "type":    e.get("type", ""),
                "desc":    e.get("desc", ""),
                "amount":  _safe_float(e.get("amount")),
            })
    all_events.sort(key=lambda x: x["date"], reverse=True)

    # Top 伙伴
    top_partners = [
        {
            "id":       str(p.id),
            "name":     p.name,
            "score":    float(p.total_score or 0),
            "tier":     p.tier or "growth",
            "revenue":  round(_safe_float(
                ((profiles.get(str(p.id)) or {}).get("kpi") or {}).get("revenue_total")
            ) / 10000, 1),
            "category": ((profiles.get(str(p.id)) or {}).get("pri") or {}).get("category", ""),
        }
        for p in partners[:8]
    ]

    return {
        "manager_name":  uname,
        "role":          role,
        "stats":         stats,
        "output_trends": output_trends,
        "recent_events": all_events[:30],
        "top_partners":  top_partners,
    }
