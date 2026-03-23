from __future__ import annotations

import os
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.database import AsyncSessionLocal, close_duckdb, engine

# ── Redis client (module-level, initialised in lifespan) ─────────────────────
redis_client: aioredis.Redis | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: open DB pool + Redis.  Shutdown: close them."""
    global redis_client

    import logging
    logger = logging.getLogger("metadatahub")

    # Ensure upload directory exists
    os.makedirs(settings.upload_dir, exist_ok=True)

    # Test PostgreSQL connectivity (non-fatal on startup)
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        logger.info("PostgreSQL connected")
    except Exception as exc:
        logger.warning("PostgreSQL not available: %s", exc)

    # Connect Redis (non-fatal on startup)
    try:
        redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)
        await redis_client.ping()
        logger.info("Redis connected")
    except Exception as exc:
        logger.warning("Redis not available: %s", exc)
        redis_client = None

    yield

    # Shutdown
    await engine.dispose()
    if redis_client:
        await redis_client.aclose()
    close_duckdb()


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="MetadataHub API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────────────────────────────

from app.api import admin, ai_admin, auth, config, dashboards, datasets, health, query  # noqa: E402
from app.models import dashboard as _dashboard_model  # noqa: F401  ensure model is registered
from fastapi.staticfiles import StaticFiles  # noqa: E402

app.include_router(health.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(datasets.router, prefix="/api/v1")
app.include_router(query.router, prefix="/api/v1")
app.include_router(dashboards.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(config.router, prefix="/api/v1")
app.include_router(ai_admin.router, prefix="/api/v1")

# Serve uploaded branding assets (logos, favicons)
os.makedirs(settings.upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")
