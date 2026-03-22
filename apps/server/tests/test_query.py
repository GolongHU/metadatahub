"""
Query engine tests:
- SQL safety checker (no Claude API needed)
- DuckDB executor round-trip (uses in-memory DuckDB)
- /ask endpoint (Claude mocked)
"""
from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import duckdb
import pytest

from app.schemas.query import GeneratedSQL, SafetyResult
from app.services.query_executor import _inject_limit, check_sql_safety

ROOT = Path(__file__).resolve().parents[3]
SAMPLE_XLSX = ROOT / "examples" / "sample_partner_data.xlsx"


# ── SQL Safety Checker ────────────────────────────────────────────────────────

def test_safe_select():
    result = check_sql_safety(
        'SELECT region, SUM(CAST(revenue AS DOUBLE)) FROM "dataset_abc123" GROUP BY region',
        allowed_tables=["dataset_abc123"],
    )
    assert result.safe is True


def test_blocks_drop():
    # Non-SELECT → blocked at the first check; DROP embedded in a SELECT → blocked by pattern
    result = check_sql_safety("DROP TABLE users", allowed_tables=["dataset_abc"])
    assert result.safe is False

    # When it starts with SELECT but has DROP inside
    result2 = check_sql_safety(
        "SELECT * FROM dataset_abc; DROP TABLE users",
        allowed_tables=["dataset_abc"],
    )
    assert result2.safe is False  # blocked by semicolon or DROP


def test_blocks_delete():
    result = check_sql_safety("DELETE FROM dataset_abc WHERE 1=1", allowed_tables=["dataset_abc"])
    assert result.safe is False


def test_blocks_union():
    result = check_sql_safety(
        "SELECT * FROM dataset_abc UNION SELECT * FROM users",
        allowed_tables=["dataset_abc", "users"],
    )
    assert result.safe is False
    assert "UNION" in result.reason


def test_blocks_comment():
    result = check_sql_safety(
        "SELECT 1 -- comment",
        allowed_tables=["dataset_abc"],
    )
    assert result.safe is False


def test_blocks_semicolon():
    result = check_sql_safety(
        "SELECT 1; DROP TABLE users",
        allowed_tables=["dataset_abc"],
    )
    assert result.safe is False


def test_blocks_unknown_table():
    result = check_sql_safety(
        "SELECT * FROM secret_table",
        allowed_tables=["dataset_abc"],
    )
    assert result.safe is False
    assert "unauthorized" in result.reason.lower()


def test_blocks_non_select():
    result = check_sql_safety(
        "INSERT INTO dataset_abc VALUES (1)",
        allowed_tables=["dataset_abc"],
    )
    assert result.safe is False
    assert "SELECT" in result.reason


def test_inject_limit_adds_limit():
    sql = 'SELECT * FROM "dataset_abc"'
    result = _inject_limit(sql, 100)
    assert "LIMIT 100" in result


def test_inject_limit_respects_existing():
    sql = 'SELECT * FROM "dataset_abc" LIMIT 5'
    result = _inject_limit(sql, 100)
    assert result.count("LIMIT") == 1
    assert "LIMIT 5" in result


# ── DuckDB Executor ───────────────────────────────────────────────────────────

@pytest.fixture
def in_memory_dataset():
    """
    Create an in-memory DuckDB table with sample data and
    monkey-patch get_duckdb to return a cursor from it.
    """
    conn = duckdb.connect(":memory:")
    table = "dataset_testabcdef"
    conn.execute(f"""
        CREATE TABLE "{table}" (
            partner_name VARCHAR,
            region VARCHAR,
            tier VARCHAR,
            revenue VARCHAR,
            deal_count VARCHAR,
            month VARCHAR
        )
    """)
    conn.execute(f"""
        INSERT INTO "{table}" VALUES
            ('Acme', 'East', 'Gold', '120000.0', '10', '2026-01'),
            ('Beta', 'North', 'Silver', '80000.0', '7', '2026-01'),
            ('Gamma', 'East', 'Bronze', '40000.0', '4', '2026-02'),
            ('Delta', 'South', 'Gold', '200000.0', '15', '2026-02'),
            ('Epsilon', 'West', 'Silver', '60000.0', '5', '2026-03')
    """)

    def _get_cursor():
        return conn.cursor()

    with patch("app.services.query_executor.get_duckdb", side_effect=_get_cursor):
        yield table, conn

    conn.close()


def test_execute_query_basic(in_memory_dataset):
    from app.services.query_executor import execute_query
    table, _ = in_memory_dataset

    result = execute_query(
        f'SELECT region, SUM(CAST(revenue AS DOUBLE)) as total FROM "{table}" GROUP BY region ORDER BY total DESC',
        dataset_table=table,
    )
    assert result.row_count == 4
    assert "region" in result.columns
    assert "total" in result.columns
    assert result.execution_time_ms >= 0


def test_execute_query_limit(in_memory_dataset):
    from app.services.query_executor import execute_query
    table, _ = in_memory_dataset

    result = execute_query(f'SELECT * FROM "{table}"', dataset_table=table)
    # _inject_limit adds LIMIT 10000, but we only have 5 rows
    assert result.row_count == 5


# ── /ask endpoint (Claude mocked) ────────────────────────────────────────────

@pytest.fixture
def client():
    from app.main import app
    from fastapi.testclient import TestClient
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


def _make_auth_override(user_id: uuid.UUID | None = None):
    from app.schemas.auth import AuthenticatedUser
    uid = user_id or uuid.uuid4()
    fake_user = AuthenticatedUser(
        user_id=uid,
        jti=str(uuid.uuid4()),
        name="Admin",
        email="admin@metadatahub.local",
        role="admin",
        pv=1,
        scope_desc="所有数据",
    )
    async def _override():
        return fake_user
    return _override


def _make_dataset_mock(dataset_id: uuid.UUID, schema_info: dict) -> MagicMock:
    ds = MagicMock()
    ds.id = dataset_id
    ds.is_active = True
    ds.schema_info = schema_info
    return ds


def test_ask_endpoint_success(client):
    """Full /ask flow with mocked DB + Claude + DuckDB."""
    from app.main import app
    from app.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = _make_auth_override()

    dataset_id = uuid.uuid4()
    schema_info = {
        "columns": [
            {"name": "region", "type": "string", "nullable": False, "null_ratio": 0,
             "distinct_count": 4, "sample_values": ["East", "North", "South", "West"],
             "min_value": None, "max_value": None, "description": "Region"},
            {"name": "revenue", "type": "float", "nullable": False, "null_ratio": 0,
             "distinct_count": 100, "sample_values": [120000.0],
             "min_value": 10000, "max_value": 200000, "description": "Revenue"},
        ],
        "row_count": 100,
    }
    mock_dataset = _make_dataset_mock(dataset_id, schema_info)

    # Mock DB
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_dataset
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=mock_result)
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    table_name = f"dataset_{dataset_id.hex}"

    # Mock Claude
    mock_generated = GeneratedSQL(
        sql=f'SELECT region, SUM(CAST(revenue AS DOUBLE)) AS total FROM "{table_name}" GROUP BY region ORDER BY total DESC',
        explanation="按区域汇总总营收，从高到低排序。",
        chart_type="bar",
    )

    # Mock DuckDB
    conn = duckdb.connect(":memory:")
    conn.execute(f'CREATE TABLE "{table_name}" (region VARCHAR, revenue VARCHAR)')
    conn.execute(f"""
        INSERT INTO "{table_name}" VALUES
            ('East', '120000'), ('North', '80000'),
            ('South', '200000'), ('West', '60000')
    """)

    def _get_cursor():
        return conn.cursor()

    with (
        patch("app.database.AsyncSessionLocal", return_value=mock_session),
        patch("app.api.query.generate_sql", return_value=mock_generated),
        patch("app.services.query_executor.get_duckdb", side_effect=_get_cursor),
    ):
        resp = client.post(
            "/api/v1/query/ask",
            json={"question": "各区域的总营收", "dataset_id": str(dataset_id)},
        )

    conn.close()
    app.dependency_overrides.clear()

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["chart_type"] == "bar"
    assert "sql" in data
    assert "explanation" in data
    assert data["data"]["row_count"] == 4
    assert "region" in data["data"]["columns"]
    assert "total" in data["data"]["columns"]


def test_ask_endpoint_safety_block(client):
    """SQL that fails safety check → 422."""
    from app.main import app
    from app.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = _make_auth_override()

    dataset_id = uuid.uuid4()
    schema_info = {
        "columns": [
            {"name": "region", "type": "string", "nullable": False, "null_ratio": 0,
             "distinct_count": 4, "sample_values": [], "description": ""}
        ],
        "row_count": 10,
    }
    mock_dataset = _make_dataset_mock(dataset_id, schema_info)

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_dataset
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=mock_result)
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    # Claude generates dangerous SQL
    dangerous = GeneratedSQL(
        sql="DROP TABLE users",
        explanation="oops",
        chart_type="table",
    )

    with (
        patch("app.database.AsyncSessionLocal", return_value=mock_session),
        patch("app.api.query.generate_sql", return_value=dangerous),
    ):
        resp = client.post(
            "/api/v1/query/ask",
            json={"question": "drop everything", "dataset_id": str(dataset_id)},
        )

    app.dependency_overrides.clear()
    assert resp.status_code == 422
    assert "safety" in resp.json()["detail"].lower()


def test_ask_endpoint_dataset_not_found(client):
    from app.main import app
    from app.middleware.auth import get_current_user

    app.dependency_overrides[get_current_user] = _make_auth_override()

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=mock_result)
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    with patch("app.database.AsyncSessionLocal", return_value=mock_session):
        resp = client.post(
            "/api/v1/query/ask",
            json={"question": "show data", "dataset_id": str(uuid.uuid4())},
        )

    app.dependency_overrides.clear()
    assert resp.status_code == 404


def test_build_system_prompt_contains_schema():
    """Verify the system prompt includes table name and column info."""
    from app.schemas.dataset import ColumnInfo, DatasetSchema
    from app.services.ai_engine import build_system_prompt

    schema = DatasetSchema(
        row_count=100,
        columns=[
            ColumnInfo(
                name="region", type="string", nullable=False, null_ratio=0.0,
                distinct_count=4, sample_values=["East", "West"], description="Region col"
            ),
            ColumnInfo(
                name="revenue", type="float", nullable=False, null_ratio=0.0,
                distinct_count=100, sample_values=[50000.0], min_value=1000, max_value=300000,
                description="Revenue metric"
            ),
        ],
    )
    prompt = build_system_prompt("dataset_abc", schema, role="admin", scope_desc="所有数据")

    assert "dataset_abc" in prompt
    assert "region" in prompt
    assert "revenue" in prompt
    assert "bar" in prompt  # chart type hints
    assert "SELECT" in prompt  # rules mention SELECT
