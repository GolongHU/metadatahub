"""
Dataset upload + schema discovery tests.
- Schema discovery tests run purely on local files (no DB needed).
- Upload endpoint tests mock the PostgreSQL session.
"""
from __future__ import annotations

import io
import os
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.schema_discovery import discover_schema

ROOT = Path(__file__).resolve().parents[3]  # tests/ → server/ → apps/ → metadatahub/
SAMPLE_XLSX = ROOT / "examples" / "sample_partner_data.xlsx"


# ── Schema discovery tests ────────────────────────────────────────────────────

def test_discover_schema_xlsx():
    assert SAMPLE_XLSX.exists(), f"Sample file not found: {SAMPLE_XLSX}"
    schema = discover_schema(str(SAMPLE_XLSX))

    assert schema.row_count == 100
    col_names = [c.name for c in schema.columns]
    assert col_names == [
        "partner_name", "partner_id", "region", "tier",
        "month", "revenue", "deal_count", "product_line",
    ]

    # partner_name — string, many distinct values
    partner_name_col = next(c for c in schema.columns if c.name == "partner_name")
    assert partner_name_col.type == "string"
    assert partner_name_col.null_ratio == 0.0
    assert len(partner_name_col.sample_values) > 0

    # revenue — float
    revenue_col = next(c for c in schema.columns if c.name == "revenue")
    assert revenue_col.type == "float"
    assert revenue_col.min_value is not None
    assert revenue_col.max_value is not None
    assert revenue_col.min_value < revenue_col.max_value

    # deal_count — integer
    deal_col = next(c for c in schema.columns if c.name == "deal_count")
    assert deal_col.type == "integer"

    # region — categorical (4 values)
    region_col = next(c for c in schema.columns if c.name == "region")
    assert region_col.distinct_count == 4

    # tier — categorical (3 values)
    tier_col = next(c for c in schema.columns if c.name == "tier")
    assert tier_col.distinct_count == 3


def test_discover_schema_csv(tmp_path):
    csv_file = tmp_path / "test.csv"
    csv_file.write_text(
        "name,age,score,active,joined\n"
        "Alice,30,9.5,true,2024-01-15\n"
        "Bob,25,8.0,false,2024-03-20\n"
        "Charlie,,7.5,true,2024-06-01\n"
    )
    schema = discover_schema(str(csv_file))
    assert schema.row_count == 3

    col_map = {c.name: c for c in schema.columns}
    assert col_map["age"].type == "integer"
    assert col_map["score"].type == "float"
    assert col_map["active"].type == "boolean"
    assert col_map["joined"].type == "date"
    # "age" has one null
    assert col_map["age"].null_ratio > 0


def test_discover_schema_unsupported_type(tmp_path):
    bad_file = tmp_path / "file.parquet"
    bad_file.write_bytes(b"PAR1")
    with pytest.raises(ValueError, match="Unsupported file type"):
        discover_schema(str(bad_file))


# ── DuckDB round-trip test ────────────────────────────────────────────────────

def test_duckdb_load_and_query(tmp_path):
    """Load sample xlsx into DuckDB and verify we can query it."""
    import duckdb

    from app.services.schema_discovery import discover_schema

    schema = discover_schema(str(SAMPLE_XLSX))
    ds_id = uuid.uuid4()
    table_name = f"dataset_{ds_id.hex}"

    conn = duckdb.connect(":memory:")

    # Build CREATE TABLE
    col_defs = ", ".join(f'"{c.name}" VARCHAR' for c in schema.columns)
    conn.execute(f'CREATE TABLE "{table_name}" ({col_defs})')

    # Load data
    import openpyxl
    wb = openpyxl.load_workbook(str(SAMPLE_XLSX), data_only=True, read_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    headers = [str(h) for h in rows[0]]
    data_rows = rows[1:]

    ph = ", ".join("?" * len(headers))
    for row in data_rows:
        str_row = [str(v) if v is not None else None for v in row]
        conn.execute(f'INSERT INTO "{table_name}" VALUES ({ph})', str_row)

    total = conn.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()[0]
    assert total == 100

    # Verify preview
    preview = conn.execute(f'SELECT * FROM "{table_name}" LIMIT 5').fetchall()
    assert len(preview) == 5

    # Verify group-by query works
    regions = conn.execute(
        f'SELECT region, COUNT(*) as cnt FROM "{table_name}" GROUP BY region ORDER BY region'
    ).fetchall()
    assert len(regions) == 4  # East, North, South, West

    conn.close()


# ── Upload endpoint test (mocked DB) ─────────────────────────────────────────

@pytest.fixture
def client():
    from app.main import app
    from fastapi.testclient import TestClient
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


def _mock_auth():
    """Return a get_current_user override that yields a fake admin."""
    from app.schemas.auth import AuthenticatedUser
    fake_user = AuthenticatedUser(
        user_id=uuid.uuid4(),
        jti=str(uuid.uuid4()),
        name="Admin",
        email="admin@metadatahub.local",
        role="admin",
        pv=1,
    )
    async def _override():
        return fake_user
    return _override


def test_upload_endpoint(client, tmp_path):
    """Upload the sample xlsx through the API (mocked DB)."""
    from app.api import datasets as ds_module
    from app.middleware.auth import get_current_user
    from app.main import app

    # Override auth
    app.dependency_overrides[get_current_user] = _mock_auth()

    # Mock DB session
    saved_dataset: list = []

    def _add_side_effect(obj):
        saved_dataset.append(obj)

    from datetime import datetime, timezone

    async def _mock_refresh(obj):
        # Simulate what PostgreSQL server_default would set
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime.now(timezone.utc)
        if getattr(obj, "updated_at", None) is None:
            obj.updated_at = datetime.now(timezone.utc)

    mock_session = AsyncMock()
    mock_session.add = MagicMock(side_effect=_add_side_effect)
    mock_session.commit = AsyncMock()
    mock_session.refresh = AsyncMock(side_effect=_mock_refresh)
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    with open(SAMPLE_XLSX, "rb") as f:
        content = f.read()

    with (
        patch("app.database.AsyncSessionLocal", return_value=mock_session),
        patch("app.api.datasets.get_duckdb") as mock_duckdb,
    ):
        # Provide a real in-memory DuckDB connection for the test
        import duckdb
        real_conn = duckdb.connect(":memory:")
        mock_duckdb.return_value = real_conn

        resp = client.post(
            "/api/v1/datasets/upload",
            files={"file": ("sample_partner_data.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )

    app.dependency_overrides.clear()

    assert resp.status_code == 201, resp.text
    # DB session.add was called with a Dataset object
    assert len(saved_dataset) == 1
    dataset_obj = saved_dataset[0]
    assert dataset_obj.row_count == 100
    assert dataset_obj.source_type == "xlsx"
    columns = dataset_obj.schema_info["columns"]
    col_names = [c["name"] for c in columns]
    assert "revenue" in col_names
    assert "region" in col_names
