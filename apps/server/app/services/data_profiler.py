"""data_profiler.py — 数据集客观统计画像（纯 DuckDB，不调用 AI）"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


# ── Data structures ───────────────────────────────────────────────────────────

@dataclass
class FieldProfile:
    name: str
    type: str
    total: int = 0
    distinct_count: int = 0
    null_ratio: float = 0.0
    zero_ratio: float = 0.0
    cardinality_ratio: float = 0.0
    sample_values: list[Any] = field(default_factory=list)
    numeric_stats: dict | None = None   # min/max/avg/median
    is_categorical: bool = False
    is_identifier: bool = False
    is_likely_amount: bool = False
    is_likely_percent: bool = False
    is_likely_count: bool = False
    date_range: dict | None = None


@dataclass
class DataProfile:
    dataset_id: str
    table_name: str
    row_count: int
    fields: list[FieldProfile] = field(default_factory=list)
    notable_findings: list[str] = field(default_factory=list)
    silent_segment: dict | None = None


# ── Keyword heuristics ────────────────────────────────────────────────────────

_AMOUNT_KW  = ["amount","revenue","price","cost","sales","income","payment","value",
                "金额","收入","价格","销售","营收","回款","应收","逾期","总额","费用"]
_PERCENT_KW = ["rate","ratio","percent","pct","率","比例","占比","及时率"]
_COUNT_KW   = ["count","num","cnt","qty","quantity","次数","数量","人数","笔数"]
_TIME_KW    = ["date","time","year","month","period","日期","时间","月份","年月","月","日","年"]


def _is_amount(name: str, stats: dict) -> bool:
    nl = name.lower()
    if any(k in nl or k in name for k in _AMOUNT_KW): return True
    mx = stats.get("max")
    return bool(mx and float(mx) > 1000)


def _is_percent(name: str, stats: dict) -> bool:
    nl = name.lower()
    if any(k in nl or k in name for k in _PERCENT_KW): return True
    mn, mx = stats.get("min"), stats.get("max")
    if mn is not None and mx is not None:
        try: return 0 <= float(mn) and float(mx) <= 1.01
        except: pass
    return False


def _is_count(name: str) -> bool:
    nl = name.lower()
    return any(k in nl or k in name for k in _COUNT_KW)


def _is_time_name(name: str) -> bool:
    nl = name.lower()
    return any(k in nl or k in name for k in _TIME_KW)


# ── Core sync profiler ────────────────────────────────────────────────────────

def _profile_sync(table_name: str, schema_fields: list[dict]) -> DataProfile:
    from app.database import get_duckdb
    conn = get_duckdb()

    row_count: int = conn.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()[0]

    profile = DataProfile(dataset_id="", table_name=table_name, row_count=row_count)

    for f in schema_fields:
        fname = f["name"]
        ftype = f.get("type", "string").lower()
        fp = FieldProfile(name=fname, type=ftype, total=row_count)

        # 基础统计
        try:
            r = conn.execute(f'''
                SELECT COUNT("{fname}") AS non_null, COUNT(DISTINCT "{fname}") AS dc
                FROM "{table_name}"
            ''').fetchone()
            non_null, dc = r[0], r[1]
            fp.distinct_count = dc or 0
            fp.null_ratio = (row_count - non_null) / max(row_count, 1)
            fp.cardinality_ratio = fp.distinct_count / max(row_count, 1)
        except Exception:
            pass

        # 数值
        if ftype in ("integer","float","double","numeric","decimal","bigint","number","int"):
            try:
                s = conn.execute(f'''
                    SELECT MIN(CAST("{fname}" AS DOUBLE)), MAX(CAST("{fname}" AS DOUBLE)),
                           AVG(CAST("{fname}" AS DOUBLE)), MEDIAN(CAST("{fname}" AS DOUBLE)),
                           SUM(CASE WHEN CAST("{fname}" AS DOUBLE) = 0 THEN 1 ELSE 0 END)
                    FROM "{table_name}" WHERE "{fname}" IS NOT NULL
                ''').fetchone()
                fp.numeric_stats = {"min": s[0], "max": s[1], "avg": s[2], "median": s[3]}
                zero_cnt = s[4] or 0
                fp.zero_ratio = zero_cnt / max(non_null, 1)
                fp.is_likely_amount  = _is_amount(fname, fp.numeric_stats)
                fp.is_likely_percent = _is_percent(fname, fp.numeric_stats)
                fp.is_likely_count   = _is_count(fname)
            except Exception:
                pass

        # 字符串
        elif ftype in ("string","varchar","text"):
            try:
                rows = conn.execute(f'''
                    SELECT DISTINCT "{fname}" FROM "{table_name}"
                    WHERE "{fname}" IS NOT NULL LIMIT 15
                ''').fetchall()
                fp.sample_values = [r[0] for r in rows]
                if fp.distinct_count <= 30:
                    fp.is_categorical = True
                elif row_count > 0 and fp.distinct_count / row_count > 0.9:
                    fp.is_identifier = True
            except Exception:
                pass

        # 日期 或 名称含时间关键词
        if ftype in ("date","datetime","timestamp") or _is_time_name(fname):
            try:
                r = conn.execute(f'''
                    SELECT MIN(CAST("{fname}" AS VARCHAR)), MAX(CAST("{fname}" AS VARCHAR))
                    FROM "{table_name}" WHERE "{fname}" IS NOT NULL
                ''').fetchone()
                fp.date_range = {"min": str(r[0]), "max": str(r[1])}
            except Exception:
                pass

        profile.fields.append(fp)

    # ── 检测沉默段 ────────────────────────────────────────────────────────────
    silent_field = next(
        (fp for fp in profile.fields
         if (fp.is_likely_amount or fp.is_likely_count) and fp.zero_ratio > 0.2),
        None
    )
    if silent_field:
        try:
            r = conn.execute(f'''
                SELECT
                  SUM(CASE WHEN CAST("{silent_field.name}" AS DOUBLE) = 0 OR
                               "{silent_field.name}" IS NULL THEN 1 ELSE 0 END) AS silent,
                  SUM(CASE WHEN CAST("{silent_field.name}" AS DOUBLE) > 0 THEN 1 ELSE 0 END) AS active
                FROM "{table_name}"
            ''').fetchone()
            silent_cnt, active_cnt = r[0] or 0, r[1] or 0
            total = silent_cnt + active_cnt
            profile.silent_segment = {
                "detector_field": silent_field.name,
                "silent_count": silent_cnt,
                "active_count": active_cnt,
                "silent_ratio": silent_cnt / max(total, 1),
            }
        except Exception:
            pass

    # ── Notable findings ──────────────────────────────────────────────────────
    findings: list[str] = [f"数据集共 {row_count} 行 × {len(profile.fields)} 列"]

    seg = profile.silent_segment
    if seg and seg["silent_ratio"] > 0.25:
        findings.append(
            f"⚠ {seg['silent_count']} 行（{seg['silent_ratio']*100:.0f}%）在"
            f" {seg['detector_field']} 上为零或空 — 可能是沉默/未活跃记录"
        )

    for fp in profile.fields:
        if fp.null_ratio > 0.5:
            findings.append(f"⚠ 字段「{fp.name}」空值率 {fp.null_ratio*100:.0f}%，统计意义有限")
        if fp.is_categorical and fp.sample_values:
            findings.append(f"分类字段「{fp.name}」: {fp.distinct_count} 个分类 — {fp.sample_values[:6]}")
        if fp.is_likely_amount and fp.numeric_stats:
            s = fp.numeric_stats
            findings.append(
                f"金额字段「{fp.name}」: 范围 {s['min']:.0f}~{s['max']:.0f}，均值 {s['avg']:.0f}"
            )
        if fp.is_likely_percent and fp.numeric_stats:
            avg = fp.numeric_stats.get("avg", 0)
            if avg is not None and avg <= 1:
                avg *= 100
            findings.append(f"比率字段「{fp.name}」: 平均 {avg:.0f}%")
        if fp.date_range:
            findings.append(f"时间字段「{fp.name}」: {fp.date_range['min']} 至 {fp.date_range['max']}")

    profile.notable_findings = findings
    return profile


async def profile_dataset(dataset_id: str, table_name: str, schema_fields: list[dict]) -> DataProfile:
    """异步入口，在线程池中运行同步 DuckDB 调用。"""
    import asyncio
    from concurrent.futures import ThreadPoolExecutor
    from functools import partial

    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=1) as ex:
        result = await loop.run_in_executor(ex, partial(_profile_sync, table_name, schema_fields))
    result.dataset_id = dataset_id
    return result
