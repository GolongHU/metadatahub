from __future__ import annotations

import re
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.dataset import Dataset
from app.schemas.auth import AuthenticatedUser
from app.services.query_executor import execute_query

router = APIRouter(prefix="/kpi-dashboard", tags=["kpi-dashboard"])

# 年度目标（可后续做成可配置）
TARGETS = {
    "报备数":     7000,
    "产单伙伴":   1290,
    "非直签金额": 40300,
    "商城订单":   3000,
}


def _find_dataset(datasets: list[Dataset], pattern: str) -> Optional[Dataset]:
    """按名称模式找最新上传的数据集"""
    matched = [d for d in datasets if re.search(pattern, d.name, re.IGNORECASE)]
    if not matched:
        return None
    return max(matched, key=lambda d: d.created_at)


def _safe_query(sql: str, table: str) -> list:
    try:
        r = execute_query(sql, dataset_table=table)
        return r.rows
    except Exception:
        return []


@router.get("/available-months")
async def available_months(
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> dict[str, Any]:
    """返回数据集中可选的月份列表"""
    res = await db.execute(select(Dataset).where(Dataset.is_active == True))  # noqa: E712
    all_ds = res.scalars().all()
    ds_report = _find_dataset(all_ds, r"商机报备明细表|商机报备")
    if not ds_report:
        return {"months": [], "default": None}
    t = f"dataset_{ds_report.id.hex}"
    cols = [c["name"] for c in ds_report.schema_info.get("columns", [])]
    date_col = next((c for c in cols if c == "创建日期"), None)
    if not date_col:
        return {"months": [], "default": None}
    rows = _safe_query(
        f'SELECT DISTINCT SUBSTR(CAST("{date_col}" AS VARCHAR),1,7) AS mo '
        f'FROM "{t}" WHERE "{date_col}" IS NOT NULL ORDER BY mo DESC LIMIT 24', t)
    months = [r[0] for r in rows if r[0] and len(str(r[0])) == 7]
    return {"months": months, "default": months[0] if months else None}


@router.get("/summary")
async def kpi_summary(
    period_end: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> dict[str, Any]:
    """返回月度运营 KPI 总览数据，period_end 格式 YYYY-MM 表示截止月份"""
    res = await db.execute(
        select(Dataset).where(Dataset.is_active == True)  # noqa: E712
    )
    all_ds = res.scalars().all()

    # ── 找各明细表 ────────────────────────────────────────────────────────────
    ds_report  = _find_dataset(all_ds, r"商机报备明细表|商机报备")
    ds_project = _find_dataset(all_ds, r"非直签项目明细表|非直签")
    ds_detail  = _find_dataset(all_ds, r"明细表(?!.*商机|.*非直签|.*认证)|_明细表_")
    ds_cert    = _find_dataset(all_ds, r"认证级新增|认证级伙伴")

    # period_end 决定年份和截止月份，例如 "2026-05" 表示统计 2026-01 ~ 2026-05
    # 若未指定，取数据中最大年月
    _year_from_period = period_end[:4] if period_end else None

    def _make_date_filter(date_col: str, table: str, prefix: str = "WHERE") -> str:
        """生成年月范围过滤条件，period_end 指定截止月份"""
        dc = f'SUBSTR(CAST("{date_col}" AS VARCHAR),1,7)'
        if period_end:
            yr = period_end[:4]
            return f'{prefix} {dc} >= \'{yr}-01\' AND {dc} <= \'{period_end}\''
        # 未指定则取数据中最大月份（YYYY-MM），自动作为截止，避免将未来预计日期算入
        mo_rows = _safe_query(f'SELECT MAX({dc}) FROM "{table}" WHERE {dc} IS NOT NULL AND {dc} != \'None\'', table)
        max_mo = mo_rows[0][0] if mo_rows and mo_rows[0][0] else None
        if max_mo and len(str(max_mo)) == 7:
            yr = str(max_mo)[:4]
            return f'{prefix} {dc} >= \'{yr}-01\' AND {dc} <= \'{max_mo}\''
        yr = str(max_mo)[:4] if max_mo else "2026"
        return f'{prefix} SUBSTR(CAST("{date_col}" AS VARCHAR),1,4) = \'{yr}\''

    # ── 商机报备数 ────────────────────────────────────────────────────────────
    report_cnt = 0
    if ds_report:
        t = f"dataset_{ds_report.id.hex}"
        cols = [c["name"] for c in ds_report.schema_info.get("columns", [])]
        date_col = next((c for c in cols if c == "创建日期"), None)
        where = _make_date_filter(date_col, t) if date_col else ""
        rows = _safe_query(f'SELECT COUNT(*) FROM "{t}" {where}', t)
        if rows:
            report_cnt = int(rows[0][0] or 0)

    # ── 产单伙伴数 & 非直签金额 & 商城订单金额 ────────────────────────────────
    partner_cnt = 0
    nozh_amt    = 0.0
    mall_amt    = 0.0
    if ds_project:
        t = f"dataset_{ds_project.id.hex}"
        cols = [c["name"] for c in ds_project.schema_info.get("columns", [])]
        partner_col = next((c for c in cols if c == "伙伴名称"), None)
        amt_col     = next((c for c in cols if c == "签单额"), None)
        status_col  = next((c for c in cols if "项目状态" in c), None)
        type_col    = next((c for c in cols if c == "crm/商城"), None)
        date_col    = next((c for c in cols if "签署" in c or "订单时间" in c), None)
        date_where  = _make_date_filter(date_col, t, prefix="AND") if date_col else ""
        partner_sf  = f'"{status_col}" IN (\'合同签署\',\'已完成\')' if status_col else "1=1"
        crm_sf      = f'"{status_col}" = \'合同签署\' AND "{type_col}" = \'crm\'' if (status_col and type_col) else (f'"{status_col}" = \'合同签署\'' if status_col else "1=1")
        mall_sf     = f'"{type_col}" = \'商城\'' if type_col else "1=0"

        if partner_col:
            rows = _safe_query(
                f'SELECT COUNT(DISTINCT "{partner_col}") FROM "{t}" '
                f'WHERE {partner_sf} {date_where} '
                f'AND "{partner_col}" IS NOT NULL AND "{partner_col}" != \'\'', t)
            if rows:
                partner_cnt = int(rows[0][0] or 0)
        if amt_col:
            # 非直签金额：CRM 合同签署
            rows = _safe_query(
                f'SELECT SUM(TRY_CAST("{amt_col}" AS DOUBLE)) FROM "{t}" '
                f'WHERE {crm_sf} {date_where}', t)
            if rows and rows[0][0]:
                nozh_amt = round(float(rows[0][0]) / 10000, 1)
            # 商城订单金额
            rows = _safe_query(
                f'SELECT SUM(TRY_CAST("{amt_col}" AS DOUBLE)) FROM "{t}" '
                f'WHERE {mall_sf} {date_where}', t)
            if rows and rows[0][0]:
                mall_amt = round(float(rows[0][0]) / 10000, 1)

    # ── 认证级新增伙伴 ────────────────────────────────────────────────────────
    cert_cnt = 0
    if ds_cert:
        t = f"dataset_{ds_cert.id.hex}"
        cols = [c["name"] for c in ds_cert.schema_info.get("columns", [])]
        date_col = next((c for c in cols if "签约时间" in c or "时间" in c), None)
        where = _make_date_filter(date_col, t) if date_col else ""
        rows = _safe_query(f'SELECT COUNT(*) FROM "{t}" {where}', t)
        if rows:
            cert_cnt = int(rows[0][0] or 0)

    # ── 区域分布 ──────────────────────────────────────────────────────────────
    region_data: list[dict] = []
    if ds_project:
        t = f"dataset_{ds_project.id.hex}"
        cols = [c["name"] for c in ds_project.schema_info.get("columns", [])]
        region_col = next((c for c in cols if "伙伴所属战队二级部门" in c), None)
        amt_col    = next((c for c in cols if c == "签单额"), None)
        status_col = next((c for c in cols if "项目状态" in c), None)
        date_col   = next((c for c in cols if "签署" in c or "订单时间" in c), None)
        date_where = _make_date_filter(date_col, t, prefix="AND") if date_col else ""
        sf = f'"{status_col}" IN (\'合同签署\',\'已完成\')' if status_col else "1=1"
        if region_col and amt_col:
            rows = _safe_query(
                f'SELECT "{region_col}", COUNT(DISTINCT "伙伴名称") AS cnt, '
                f'SUM(TRY_CAST("{amt_col}" AS DOUBLE)) AS amt FROM "{t}" '
                f'WHERE {sf} {date_where} '
                f'AND "{region_col}" IS NOT NULL AND "{region_col}" != \'\' '
                f'GROUP BY "{region_col}" ORDER BY amt DESC NULLS LAST LIMIT 8', t)
            for row in rows:
                region_data.append({
                    "name":   str(row[0]),
                    "count":  int(row[1] or 0),
                    "amount": round(float(row[2] or 0) / 10000, 1),
                })

    # ── 认证级新增月度趋势 + 同比 ─────────────────────────────────────────────
    cert_trend: list[dict] = []
    if ds_cert:
        t = f"dataset_{ds_cert.id.hex}"
        cols = [c["name"] for c in ds_cert.schema_info.get("columns", [])]
        date_col = next((c for c in cols if "日期" in c or "时间" in c or "创建" in c), None)
        if date_col:
            # 获取本年和去年的月度数据
            rows = _safe_query(
                f'SELECT SUBSTR(CAST("{date_col}" AS VARCHAR), 1, 7) AS mo, COUNT(*) AS cnt '
                f'FROM "{t}" WHERE "{date_col}" IS NOT NULL '
                f'GROUP BY mo ORDER BY mo', t)
            # 按年份和月份组织数据
            trend_by_month: dict[str, dict] = {}
            for row in rows:
                if row[0] and str(row[0]).strip():
                    mo_str = str(row[0])  # YYYY-MM
                    month = mo_str[5:7]  # MM
                    year = mo_str[0:4]   # YYYY
                    if month not in trend_by_month:
                        trend_by_month[month] = {}
                    trend_by_month[month][year] = int(row[1] or 0)
            # 转换为前端需要的格式 [{"month": "01", "2025": 30, "2026": 16}, ...]
            for month in sorted(trend_by_month.keys()):
                item = {"month": month}
                item.update(trend_by_month[month])
                cert_trend.append(item)

    # ── 数据来源说明 ──────────────────────────────────────────────────────────
    sources = {
        "报备": ds_report.name if ds_report else None,
        "项目": ds_project.name if ds_project else None,
        "明细": ds_detail.name if ds_detail else None,
        "认证": ds_cert.name if ds_cert else None,
    }

    return {
        "kpis": {
            "report_count":  {"value": report_cnt,  "target": TARGETS["报备数"],     "label": "商机报备",  "unit": "条"},
            "partner_count": {"value": partner_cnt, "target": TARGETS["产单伙伴"],   "label": "产单伙伴",  "unit": "家"},
            "nozh_amount":   {"value": nozh_amt,    "target": TARGETS["非直签金额"], "label": "非直签金额", "unit": "万"},
            "mall_order":    {"value": mall_amt,     "target": TARGETS["商城订单"],   "label": "商城订单",  "unit": "万"},
            "cert_new":      {"value": cert_cnt,    "target": 860,                    "label": "认证级新增", "unit": "家"},
        },
        "region_breakdown": region_data,
        "cert_trend": cert_trend,
        "sources": sources,
        "dataset_id": str(ds_report.id) if ds_report else None,
        "data_available": any([ds_report, ds_project, ds_detail, ds_cert]),
    }
