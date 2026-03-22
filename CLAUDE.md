# CLAUDE.md — MetadataHub Project Instructions

## Project Overview

MetadataHub is an AI-powered metadata-centric data analytics platform. Users import data (Excel, CSV, BI APIs), and the platform uses AI (Claude API) to generate SQL queries and dashboards from natural language. Key differentiators: conversational BI, row-level data permissions, dashboard marketplace for community templates.

## Tech Stack

- **Backend**: Python 3.12+ / FastAPI / Uvicorn
- **Database**: PostgreSQL 16 (primary) + DuckDB (analytics acceleration)
- **Cache**: Redis 7
- **AI**: Anthropic Claude API (claude-sonnet-4-20250514 for NL2SQL)
- **Frontend**: React 18 + TypeScript + Vite + Ant Design 5
- **Charts**: ECharts 5
- **Package Manager**: pnpm (monorepo workspace)
- **ORM**: SQLAlchemy 2.0 (async) + Alembic migrations
- **Auth**: JWT (python-jose) + httpOnly refresh cookies
- **Containerization**: Docker Compose

## Repository Structure

```
metadatahub/
├── CLAUDE.md                  # This file
├── PLAN.md                    # Current phase task breakdown
├── docker-compose.yml         # PG + Redis + DuckDB
├── .env.example               # Environment variables template
├── apps/
│   ├── server/                # FastAPI backend
│   │   ├── app/
│   │   │   ├── main.py        # FastAPI app entry
│   │   │   ├── config.py      # Settings (pydantic-settings)
│   │   │   ├── database.py    # Async PG + DuckDB connections
│   │   │   ├── models/        # SQLAlchemy ORM models
│   │   │   ├── schemas/       # Pydantic request/response schemas
│   │   │   ├── api/           # Route modules
│   │   │   │   ├── auth.py
│   │   │   │   ├── datasets.py
│   │   │   │   ├── query.py
│   │   │   │   └── dashboards.py
│   │   │   ├── services/      # Business logic
│   │   │   │   ├── ai_engine.py
│   │   │   │   ├── schema_discovery.py
│   │   │   │   ├── permission_resolver.py
│   │   │   │   └── query_executor.py
│   │   │   └── middleware/     # Auth, CORS, error handling
│   │   ├── alembic/           # Database migrations
│   │   ├── tests/
│   │   ├── pyproject.toml
│   │   └── Dockerfile
│   └── web/                   # React frontend
│       ├── src/
│       │   ├── App.tsx
│       │   ├── pages/
│       │   │   ├── ChatPage.tsx
│       │   │   ├── DashboardPage.tsx
│       │   │   └── UploadPage.tsx
│       │   ├── components/
│       │   │   ├── ChatPanel.tsx
│       │   │   ├── ChartWidget.tsx
│       │   │   └── DataTable.tsx
│       │   ├── services/      # API clients
│       │   ├── stores/        # Zustand state
│       │   └── types/
│       ├── package.json
│       ├── vite.config.ts
│       └── Dockerfile
├── packages/                  # Shared code (future)
├── docs/
│   └── MetadataHub_Complete_Knowledge_Base.md
└── examples/
    └── sample_partner_data.xlsx
```

## Coding Conventions

### Python (Backend)
- Use async/await everywhere (async SQLAlchemy, async httpx)
- Type hints on all function signatures
- Pydantic v2 for all request/response schemas
- Use `from __future__ import annotations` in every file
- Error responses follow: `{"detail": "message", "code": "ERROR_CODE"}`
- Environment variables via pydantic-settings, never hardcoded
- All SQL queries parameterized, never string-interpolated

### TypeScript (Frontend)
- Functional components only, no class components
- Zustand for global state (not Redux)
- All API calls through a centralized `api.ts` client with interceptors
- Use Ant Design components, custom styling via CSS modules
- ECharts wrapped in a reusable `<ChartWidget option={...} />` component

### API Design
- RESTful: `/api/v1/{resource}`
- Auth: `Authorization: Bearer {access_token}`
- Pagination: `?page=1&page_size=20`
- Errors: HTTP status codes + structured JSON body
- File uploads: multipart/form-data to `/api/v1/datasets/upload`

### Database
- All tables use UUID primary keys (`gen_random_uuid()`)
- Timestamps: `TIMESTAMPTZ`, always UTC
- Soft delete with `is_active` boolean (no hard deletes in Phase 1)
- JSON columns use JSONB type
- Indexes on all foreign keys and frequent query columns

## Key Architecture Decisions

### Permission System (3 layers)
1. **RBAC**: Role → functional permissions (what API endpoints can they call)
2. **Dataset ACL**: Role/User/Group → which datasets they can access
3. **Row-Level Security**: User attributes (region, partner_id) → auto-injected WHERE clauses

Permission Resolver takes user attributes from JWT and generates WHERE clauses.
RLS rules are cached in Redis. JWT carries attributes, not rules.

### JWT Design
- Access Token: 15 min, in JS memory, carries user attributes (role, region, partner_id, datasets[], pv)
- Refresh Token: 7 days, httpOnly cookie, opaque string, server-side stored
- Permission Version (pv): bumped when admin changes user permissions, middleware checks Redis

### AI Engine
- Claude API with metadata context in System Prompt
- SQL safety checker (whitelist tables, block DDL/DML, no UNION injection)
- Permission WHERE injected AFTER AI generates SQL, using CTE wrapper
- scope_desc field in JWT tells AI the user's visible scope for accurate wording

## Commands

```bash
# Start all services
docker-compose up -d

# Backend
cd apps/server
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000

# Frontend
cd apps/web
pnpm install
pnpm dev   # → http://localhost:5173

# Database migrations
cd apps/server
alembic upgrade head
alembic revision --autogenerate -m "description"

# Tests
cd apps/server
pytest tests/ -v
```

## Environment Variables

```env
# Database
DATABASE_URL=postgresql+asyncpg://metadatahub:metadatahub@localhost:5432/metadatahub
REDIS_URL=redis://localhost:6379/0

# Auth
JWT_SECRET_KEY=your-256-bit-secret-change-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# AI
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-sonnet-4-20250514

# App
APP_ENV=development
CORS_ORIGINS=http://localhost:5173
```

## Current Phase

See PLAN.md for the active task breakdown.
