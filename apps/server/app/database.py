from __future__ import annotations

import duckdb
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# ── PostgreSQL (SQLAlchemy async) ─────────────────────────────────────────────

engine: AsyncEngine = create_async_engine(
    settings.database_url,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    echo=settings.is_development,
)

AsyncSessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    """FastAPI dependency: yields an async DB session."""
    async with AsyncSessionLocal() as session:
        yield session


# ── DuckDB (analytics) ───────────────────────────────────────────────────────

_duckdb_conn: duckdb.DuckDBPyConnection | None = None


def _init_partner_views(conn: duckdb.DuckDBPyConnection) -> None:
    """Load partner data from PostgreSQL into a persistent DuckDB table for NL2SQL."""
    import logging, re
    import psycopg2
    # Use settings.database_url (pydantic-settings loads .env; os.environ may be empty)
    pg_url = settings.database_url or ""
    m = re.match(r"postgresql(?:\+asyncpg)?://([^:]+):([^@]+)@([^:/]+):?(\d*)/(.+)", pg_url)
    if not m:
        return
    user, pwd, host, port, db = m.groups()
    dsn = f"host={host} port={port or '5432'} dbname={db} user={user} password={pwd}"
    try:
        pg = psycopg2.connect(dsn)
        cur = pg.cursor()
        cur.execute("""
            SELECT
                p.id::TEXT, p.name, p.region, p.tier,
                ROUND(p.total_score::NUMERIC,2)::FLOAT,
                p.ops_manager, p.partner_manager,
                COALESCE((pp.profile_data->'kpi'->>'revenue_total')::FLOAT,0),
                COALESCE((pp.profile_data->'kpi'->>'reports_total')::INT,0),
                COALESCE((pp.profile_data->'kpi'->>'reports_deal')::INT,0),
                COALESCE((pp.profile_data->'kpi'->>'reports_active')::INT,0),
                ROUND(COALESCE((pp.profile_data->'kpi'->>'deal_rate')::NUMERIC,0),1)::FLOAT,
                ROUND(COALESCE((pp.profile_data->'kpi'->>'revenue_rate')::NUMERIC,0)*100,1)::FLOAT,
                COALESCE((pp.profile_data->'kpi'->>'cooperate_years')::FLOAT,0),
                ROUND(COALESCE((pp.profile_data->'business_output'->>'crm_amount')::NUMERIC,0)/10000,2)::FLOAT,
                ROUND(COALESCE((pp.profile_data->'business_output'->>'shop_amount')::NUMERIC,0)/10000,2)::FLOAT,
                ROUND(COALESCE((pp.profile_data->'pri'->>'d1')::NUMERIC,0),2)::FLOAT,
                ROUND(COALESCE((pp.profile_data->'pri'->>'d2')::NUMERIC,0),2)::FLOAT,
                ROUND(COALESCE((pp.profile_data->'pri'->>'d3')::NUMERIC,0),2)::FLOAT,
                ROUND(COALESCE((pp.profile_data->'pri'->>'d4')::NUMERIC,0),2)::FLOAT,
                ROUND(COALESCE((pp.profile_data->'pri'->>'d5')::NUMERIC,0),2)::FLOAT,
                COALESCE(pp.profile_data->>'level',''),
                COALESCE(pp.profile_data->>'since',''),
                COALESCE(pp.profile_data->>'status','keep')
            FROM partners p
            LEFT JOIN partner_profiles pp ON pp.partner_id = p.id
            WHERE p.is_active = true
        """)
        rows = cur.fetchall()
        cur.close(); pg.close()

        # Drop existing object regardless of type (VIEW or TABLE)
        try:
            conn.execute("DROP VIEW IF EXISTS partner_analytics")
        except Exception:
            pass  # object is a TABLE, not a VIEW — that's fine
        try:
            conn.execute("DROP TABLE IF EXISTS partner_analytics")
        except Exception:
            pass
        conn.execute("""
            CREATE TABLE partner_analytics (
                partner_id VARCHAR, 伙伴名称 VARCHAR, 大区 VARCHAR, PRI评级 VARCHAR,
                PRI综合得分 DOUBLE, 运营负责人 VARCHAR, 伙伴经理 VARCHAR,
                总回款额 DOUBLE, 总报备数 INTEGER, 成交数 INTEGER, 跟进中报备 INTEGER,
                成交率 DOUBLE, 回款率 DOUBLE, 合作年限 DOUBLE,
                CRM签约额_万元 DOUBLE, 商城实付_万元 DOUBLE,
                D1业绩贡献度 DOUBLE, D2增长驱动力 DOUBLE, D3合作紧密度 DOUBLE,
                D4运营健康度 DOUBLE, D5生态活跃度 DOUBLE,
                认证等级 VARCHAR, 首次合作日期 VARCHAR, 关系状态 VARCHAR
            )
        """)
        conn.executemany("INSERT INTO partner_analytics VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
        logging.getLogger(__name__).info(f"partner_analytics table loaded: {len(rows)} rows")
    except Exception as e:
        logging.getLogger(__name__).warning(f"Partner analytics init failed: {e}")


_partner_analytics_loaded = False


def get_duckdb() -> duckdb.DuckDBPyConnection:
    """Return the shared DuckDB connection."""
    global _duckdb_conn, _partner_analytics_loaded
    if _duckdb_conn is None:
        import os
        db_path = os.environ.get("DUCKDB_PATH", "metadatahub_analytics.db")
        _duckdb_conn = duckdb.connect(db_path)
    # Load partner_analytics once per process startup
    if not _partner_analytics_loaded:
        _init_partner_views(_duckdb_conn)
        _partner_analytics_loaded = True
    return _duckdb_conn.cursor()


def close_duckdb() -> None:
    global _duckdb_conn
    if _duckdb_conn is not None:
        _duckdb_conn.close()
        _duckdb_conn = None
