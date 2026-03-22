from __future__ import annotations

import re
import time
from typing import List

from app.database import get_duckdb
from app.schemas.query import QueryResult, SafetyResult

# ── SQL Safety Checker ────────────────────────────────────────────────────────

# Forbidden patterns from knowledge base §5 SQLSafetyChecker
_FORBIDDEN = [
    r"\bDROP\b", r"\bDELETE\b", r"\bUPDATE\b", r"\bINSERT\b",
    r"\bALTER\b", r"\bCREATE\b", r"\bTRUNCATE\b",
    r"\bGRANT\b", r"\bREVOKE\b",
    r"\bEXEC\b", r"\bEXECUTE\b",
    r"--",
    r";",
    r"\bUNION\b",
    r"\bINTO\b",       # prevent INSERT INTO / SELECT INTO
    r"\bATTACH\b",     # DuckDB-specific: prevent attaching external DBs
    r"\bCOPY\b",       # DuckDB-specific: prevent file I/O
]

_FORBIDDEN_RE = re.compile(
    "|".join(_FORBIDDEN),
    flags=re.IGNORECASE,
)

_SELECT_RE = re.compile(r"^\s*SELECT\b", re.IGNORECASE)

# Extract bare table/view names referenced in FROM / JOIN clauses
_TABLE_REF_RE = re.compile(
    r'(?:FROM|JOIN)\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?',
    re.IGNORECASE,
)


def check_sql_safety(sql: str, allowed_tables: List[str]) -> SafetyResult:
    """
    Validate AI-generated SQL before execution.

    Rules:
    1. Must start with SELECT
    2. No DDL/DML/comment/semicolon/UNION patterns
    3. Every referenced table must be in allowed_tables
    """
    sql_stripped = sql.strip()

    if not _SELECT_RE.match(sql_stripped):
        return SafetyResult(safe=False, reason="Only SELECT statements are allowed")

    match = _FORBIDDEN_RE.search(sql_stripped)
    if match:
        return SafetyResult(
            safe=False,
            reason=f"Forbidden keyword or pattern detected: '{match.group()}'",
        )

    referenced = {m.group(1).lower() for m in _TABLE_REF_RE.finditer(sql_stripped)}
    allowed_lower = {t.lower() for t in allowed_tables}
    unknown = referenced - allowed_lower
    if unknown:
        return SafetyResult(
            safe=False,
            reason=f"Query references unauthorized table(s): {unknown}",
        )

    return SafetyResult(safe=True)


# ── Query Executor ────────────────────────────────────────────────────────────

_ROW_LIMIT = 10_000
_TIMEOUT_SECONDS = 30


def execute_query(sql: str, dataset_table: str) -> QueryResult:
    """
    Execute a validated SELECT against DuckDB.
    Enforces a 10,000-row cap and returns structured results.
    """
    conn = get_duckdb()

    # Inject row limit if not already present
    limited_sql = _inject_limit(sql, _ROW_LIMIT)

    t0 = time.perf_counter()
    try:
        conn.execute(f"SET threads TO 4")
        rel = conn.execute(limited_sql)
        columns = [desc[0] for desc in rel.description]
        rows = [list(row) for row in rel.fetchall()]
    finally:
        conn.close()

    elapsed_ms = (time.perf_counter() - t0) * 1000

    return QueryResult(
        columns=columns,
        rows=rows,
        row_count=len(rows),
        execution_time_ms=round(elapsed_ms, 2),
    )


def _inject_limit(sql: str, limit: int) -> str:
    """Append LIMIT if the query doesn't already have one."""
    if re.search(r"\bLIMIT\b", sql, re.IGNORECASE):
        return sql
    return f"{sql.rstrip().rstrip(';')} LIMIT {limit}"
