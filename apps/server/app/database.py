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


def get_duckdb() -> duckdb.DuckDBPyConnection:
    """Return the shared DuckDB connection (thread-local copy for safety)."""
    global _duckdb_conn
    if _duckdb_conn is None:
        import os
        db_path = os.environ.get("DUCKDB_PATH", "metadatahub_analytics.db")
        _duckdb_conn = duckdb.connect(db_path)
    return _duckdb_conn.cursor()


def close_duckdb() -> None:
    global _duckdb_conn
    if _duckdb_conn is not None:
        _duckdb_conn.close()
        _duckdb_conn = None
