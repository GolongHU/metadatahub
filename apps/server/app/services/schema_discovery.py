from __future__ import annotations

import csv
import math
from datetime import date, datetime
from pathlib import Path
from typing import Any, List, Optional, Tuple

from app.schemas.dataset import ColumnInfo, DatasetSchema

# ── Type inference ────────────────────────────────────────────────────────────

def _try_int(v: str) -> bool:
    try:
        int(v)
        return True
    except (ValueError, TypeError):
        return False


def _try_float(v: str) -> bool:
    try:
        float(v)
        return True
    except (ValueError, TypeError):
        return False


_DATE_FMTS = ("%Y-%m-%d", "%Y/%m/%d", "%m/%d/%Y", "%d/%m/%Y", "%Y-%m")

def _try_date(v: str) -> bool:
    for fmt in _DATE_FMTS:
        try:
            datetime.strptime(str(v), fmt)
            return True
        except (ValueError, TypeError):
            pass
    return False


_BOOL_TRUE = {"true", "yes", "1", "t", "y"}
_BOOL_FALSE = {"false", "no", "0", "f", "n"}

def _try_bool(v: str) -> bool:
    return str(v).strip().lower() in _BOOL_TRUE | _BOOL_FALSE


def _infer_type(non_null_values: List[Any]) -> str:
    """Infer the most specific type that fits all non-null values."""
    if not non_null_values:
        return "string"

    strs = [str(v).strip() for v in non_null_values]

    if all(_try_bool(v) for v in strs):
        return "boolean"
    if all(_try_int(v) for v in strs):
        return "integer"
    if all(_try_float(v) for v in strs):
        return "float"
    if all(_try_date(v) for v in strs):
        return "date"
    return "string"


def _safe_min_max(values: List[Any], col_type: str) -> Tuple[Optional[Any], Optional[Any]]:
    if not values or col_type not in ("integer", "float", "date"):
        return None, None
    try:
        if col_type == "integer":
            nums = [int(str(v)) for v in values]
        elif col_type == "float":
            nums = [float(str(v)) for v in values]
        else:
            return str(min(str(v) for v in values)), str(max(str(v) for v in values))
        return min(nums), max(nums)
    except Exception:
        return None, None


# ── Readers ───────────────────────────────────────────────────────────────────

def _read_xlsx(file_path: str) -> Tuple[List[str], List[List[Any]]]:
    import openpyxl
    wb = openpyxl.load_workbook(file_path, data_only=True, read_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    if not rows:
        return [], []
    headers = [str(h) if h is not None else f"col_{i}" for i, h in enumerate(rows[0])]
    data = [list(row) for row in rows[1:]]
    return headers, data


def _read_csv(file_path: str) -> Tuple[List[str], List[List[Any]]]:
    with open(file_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        rows = list(reader)
    if not rows:
        return [], []
    headers = [h.strip() for h in rows[0]]
    data = [list(row) for row in rows[1:]]
    return headers, data


# ── Main entry point ──────────────────────────────────────────────────────────

def discover_schema(file_path: str) -> DatasetSchema:
    """
    Parse an xlsx/csv file and return a DatasetSchema with per-column statistics.
    """
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix in (".xlsx", ".xls"):
        headers, data = _read_xlsx(file_path)
    elif suffix == ".csv":
        headers, data = _read_csv(file_path)
    else:
        raise ValueError(f"Unsupported file type: {suffix}")

    row_count = len(data)
    columns: List[ColumnInfo] = []

    for col_idx, col_name in enumerate(headers):
        raw_values = [row[col_idx] if col_idx < len(row) else None for row in data]

        null_count = sum(
            1 for v in raw_values
            if v is None or (isinstance(v, float) and math.isnan(v)) or str(v).strip() == ""
        )
        null_ratio = null_count / row_count if row_count > 0 else 0.0
        non_null = [
            v for v in raw_values
            if v is not None
            and not (isinstance(v, float) and math.isnan(v))
            and str(v).strip() != ""
        ]

        col_type = _infer_type(non_null)
        distinct_count = len(set(str(v) for v in non_null))

        # Sample: up to 5 distinct values
        seen: set = set()
        samples: List[Any] = []
        for v in non_null:
            key = str(v)
            if key not in seen:
                seen.add(key)
                samples.append(v)
            if len(samples) >= 5:
                break

        min_val, max_val = _safe_min_max(non_null, col_type)

        # Auto-description (placeholder)
        description = _auto_description(col_name, col_type, distinct_count, row_count)

        columns.append(
            ColumnInfo(
                name=col_name,
                type=col_type,
                nullable=null_count > 0,
                null_ratio=round(null_ratio, 4),
                distinct_count=distinct_count,
                sample_values=[str(s) if isinstance(s, (date, datetime)) else s for s in samples],
                min_value=min_val,
                max_value=max_val,
                description=description,
            )
        )

    return DatasetSchema(columns=columns, row_count=row_count)


def _auto_description(col_name: str, col_type: str, distinct_count: int, row_count: int) -> str:
    """Generate a simple placeholder description. AI will enhance this later."""
    name_lower = col_name.lower()
    if "id" in name_lower:
        return f"Identifier column ({col_type})"
    if "name" in name_lower:
        return f"Name field — {distinct_count} distinct values"
    if col_type in ("integer", "float"):
        return f"Numeric metric ({col_type})"
    if col_type == "date":
        return "Date/time column"
    if col_type == "boolean":
        return "Boolean flag"
    if distinct_count <= 10:
        return f"Categorical — {distinct_count} categories"
    return f"Text field — {distinct_count} distinct values"
