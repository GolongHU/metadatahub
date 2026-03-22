# MetadataHub

An AI-powered metadata-centric data analytics platform. Upload Excel/CSV, ask questions in natural language, get charts.

## Quick Start

```bash
# 1. Start infrastructure
docker-compose up -d

# 2. Backend
cd apps/server
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000

# 3. Frontend
cd apps/web
pnpm install
pnpm dev   # http://localhost:5173

# 4. Run migrations
cd apps/server
alembic upgrade head
```

## Health Check

```bash
curl http://localhost:8000/api/v1/health
# → {"status":"ok","db":true,"redis":true}
```

## Tech Stack

- **Backend**: FastAPI + SQLAlchemy 2.0 (async) + DuckDB
- **Database**: PostgreSQL 16 + Redis 7
- **Frontend**: React 18 + TypeScript + Ant Design 5 + ECharts 5
- **AI**: Anthropic Claude API (NL2SQL)
