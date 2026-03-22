# PLAN.md — Phase 1: MVP

> Goal: Upload an Excel → ask a question in natural language → see a chart
> Timeline: 10 working days
> Status: Day 1-10 DONE — Tasks 1.1–1.3, 2.1–2.2, 3.1–3.3, 4.1–4.3, 5.1–5.3 complete

---

## Day 1: Project Bootstrap

### Task 1.1: Initialize monorepo
- [x] Create pnpm workspace with `apps/server` and `apps/web`
- [x] `apps/server`: Python project with pyproject.toml
  - Dependencies: fastapi, uvicorn, sqlalchemy[asyncio], asyncpg, alembic, python-jose, pydantic-settings, anthropic, openpyxl, duckdb, redis, python-multipart
  - Dev dependencies: pytest, pytest-asyncio, httpx
- [x] `apps/web`: Vite + React + TypeScript project
  - Dependencies: antd, echarts, echarts-for-react, zustand, axios
- [x] Root `.gitignore`, `.editorconfig`, `README.md`
- [x] Copy `CLAUDE.md` and this `PLAN.md` to project root

### Task 1.2: Docker Compose
- [x] `docker-compose.yml` with:
  - PostgreSQL 16 (port 5432, user/pass: metadatahub, db: metadatahub)
  - Redis 7 (port 6379)
- [x] `.env.example` with all required environment variables
- [ ] Verify: `docker-compose up -d` → both services healthy  *(需要 Docker，本机未安装)*

### Task 1.3: FastAPI app skeleton
- [x] `app/main.py`: FastAPI app with CORS, lifespan (DB pool init/close)
- [x] `app/config.py`: Settings class using pydantic-settings, reads from .env
- [x] `app/database.py`: Async SQLAlchemy engine + session factory + DuckDB connection helper
- [x] Health check endpoint: `GET /api/v1/health` → `{"status": "ok", "db": true, "redis": true}`
- [x] Verify: `uvicorn app.main:app --reload` → health check passes ✓

---

## Day 2-3: Database + Auth

### Task 2.1: Database models + migrations
- [x] `app/models/user.py`: User model (id, email, name, password_hash, role, region, department, org_node_id, partner_id, permission_version, is_active, created_at, updated_at)
- [x] `app/models/dataset.py`: Dataset model (id, name, source_type, schema_info JSONB, row_count, file_path, created_by, created_at, updated_at)
- [x] `app/models/refresh_token.py`: RefreshToken model (id, token_hash, user_id, expires_at, is_revoked, device_info JSONB, created_at)
- [x] Initialize Alembic, generate first migration (hand-written, validated with --sql)
- [x] Seed script: `scripts/seed.py` — create default admin (admin@metadatahub.local / admin123)

### Task 2.2: Auth endpoints
- [x] `POST /api/v1/auth/login` — verify password (argon2), mint access+refresh tokens
  - Access token payload: sub, name, email, role, region, partner_id, datasets[], pv, scope_desc, iat, exp, jti ✓
  - Refresh token: random urlsafe, store sha256 hash in DB, set httpOnly cookie ✓
- [x] `POST /api/v1/auth/refresh` — validate refresh token, rotate, re-load user context, mint new access
- [x] `POST /api/v1/auth/logout` — revoke refresh token, clear cookie
- [x] `GET /api/v1/auth/me` — return current user info
- [x] `app/middleware/auth.py`: `get_current_user` dependency (JWT decode + validation)
- [x] Verify: 11/11 pytest tests pass (token service + endpoint integration tests) ✓

---

## Day 4-5: Data Ingestion (First Vertical Slice)

### Task 3.1: Excel/CSV upload
- [x] `POST /api/v1/datasets/upload` — multipart .xlsx/.csv, save to uploads/, parse, DuckDB + PG
- [x] `GET /api/v1/datasets` — list with pagination
- [x] `GET /api/v1/datasets/{id}` — full schema detail
- [x] `GET /api/v1/datasets/{id}/preview?limit=20` — first N rows from DuckDB

### Task 3.2: Schema Discovery service
- [x] `app/services/schema_discovery.py` — `discover_schema(file_path) -> DatasetSchema`
  - Per-column: type inference (string/integer/float/date/boolean), null_ratio, distinct_count, sample_values, min/max
  - Auto-generated placeholder description
- [x] Verified against both xlsx and csv inputs ✓

### Task 3.3: Create sample data
- [x] `examples/sample_partner_data.xlsx` — 100 rows (partner_name, partner_id, region×4, tier×3, month×9, revenue, deal_count, product_line×4)
- [x] Verify: 16/16 pytest tests pass ✓

---

## Day 6-7: AI Query Engine

### Task 4.1: NL2SQL service
- [x] `app/services/ai_engine.py`: `generate_sql(question, table_name, schema, role, scope_desc) → GeneratedSQL`
  - System prompt: schema block (table name, columns, types, samples, ranges) + chart rules + user scope
  - Claude returns JSON: `{sql, explanation, chart_type}` — markdown fences stripped defensively
  - chart_type validated: bar | line | pie | table (fallback to "table")
- [x] `app/schemas/query.py`: AskRequest, AskResponse, GeneratedSQL, SafetyResult, QueryResult

### Task 4.2: SQL safety + execution
- [x] `app/services/query_executor.py`:
  - `check_sql_safety` — blocks non-SELECT, 13 forbidden patterns (DROP/DELETE/UPDATE/INSERT/ALTER/CREATE/TRUNCATE/GRANT/REVOKE/EXEC/UNION/ATTACH/COPY + -- and ;), checks table whitelist
  - `execute_query` — DuckDB cursor, auto-injects LIMIT 10000, returns columns/rows/row_count/ms

### Task 4.3: Query endpoint
- [x] `POST /api/v1/query/ask` — load schema → Claude → safety check → DuckDB exec → response
- [x] Verify: 32/32 pytest tests pass (safety checker + executor + endpoint + prompt) ✓

---

## Day 8-10: Frontend + Integration

### Task 5.1: React app skeleton
- [x] Routing: `/login` (public) + `/upload` / `/chat` (auth-guarded ProtectedRoute)
- [x] `src/stores/authStore.ts`: Zustand store — setAuth / logout / isAuthenticated (token + expiry)
- [x] `src/services/api.ts`: Axios with Bearer interceptor + 401 auto-refresh queue + typed endpoint helpers
- [x] `src/components/AppLayout.tsx`: dark sidebar nav (上传/对话) + user avatar + logout

### Task 5.2: Upload page
- [x] Dragger upload zone (Ant Design) — .xlsx/.xls/.csv
- [x] Schema preview table: 字段名 / 类型 Tag / 空值率 Progress / 样本值 / 描述
- [x] Stat cards: 行数 / 字段数 / 格式 / 空值字段数
- [x] "开始对话分析" → navigate `/chat?dataset_id=…`

### Task 5.3: Chat page (core MVP experience)
- [x] Dataset selector (top bar) from `GET /api/v1/datasets`
- [x] Message list: user bubble (right) + AI bubble (left) with loading skeleton
- [x] AI response: explanation text + collapsible SQL code block (dark theme) + collapsible data table
- [x] `src/components/ChartWidget.tsx`:
  - bar → `buildBarLine('bar', ...)` — multi-series, x=col[0] / y=col[1..n]
  - line → `buildBarLine('line', ...)` — smooth curves
  - pie → `buildPie(...)` — donut, legend right
  - table → Ant Design Table with numeric formatting + pagination
- [x] Preset question chips on empty state
- [x] Enter to send / Shift+Enter newline

### Task 5.4: End-to-end test
- [ ] Ready for manual test — requires Docker (PG + Redis) to start first
  - Start: `docker compose up -d && alembic upgrade head && python scripts/seed.py`
  - Then: `uvicorn app.main:app --reload` + `pnpm dev`

---

## Definition of Done (Phase 1)

- [ ] `docker-compose up` starts PG + Redis
- [ ] Backend starts with `uvicorn`, health check passes
- [ ] Login/logout works with JWT
- [ ] Excel upload + schema discovery works
- [ ] At least 3 natural language queries return correct charts
- [ ] Frontend renders charts from AI-generated data
- [ ] All code in a clean git repo with meaningful commits

## What Phase 1 does NOT include (deferred to Phase 2+)

- No RBAC / RLS permissions (everyone is admin)
- No fixed dashboards (only chat interface)
- No dashboard saving / marketplace
- No multi-table JOINs
- No refresh token rotation (basic version only)
- No production deployment
