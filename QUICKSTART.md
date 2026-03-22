# MetadataHub — Claude Code 启动指令

## 使用方法

1. 在本地创建项目目录：
   ```bash
   mkdir metadatahub && cd metadatahub
   ```

2. 把以下文件放入项目根目录：
   - `CLAUDE.md` (项目说明，Claude Code 自动读取)
   - `PLAN.md` (Phase 1 任务清单)
   - `docs/MetadataHub_Complete_Knowledge_Base.md` (完整知识库)

3. 启动 Claude Code：
   ```bash
   claude
   ```

4. 粘贴下面的启动指令：

---

## 第一条指令（粘贴到 Claude Code）

```
请阅读 CLAUDE.md 和 PLAN.md，然后执行 PLAN.md 中的 Task 1.1 + Task 1.2 + Task 1.3。

具体要求：

1. 初始化 pnpm monorepo，创建 apps/server（Python FastAPI）和 apps/web（React + Vite + TypeScript）

2. apps/server:
   - 创建 pyproject.toml，包含所有依赖（fastapi, uvicorn, sqlalchemy[asyncio], asyncpg, alembic, python-jose, pydantic-settings, anthropic, openpyxl, duckdb, redis, python-multipart）
   - 创建完整的目录结构（app/main.py, config.py, database.py, models/, schemas/, api/, services/, middleware/）
   - 实现 health check endpoint
   - 配置 CORS 和 lifespan

3. apps/web:
   - 用 Vite 创建 React + TypeScript 项目
   - 安装 antd, echarts, echarts-for-react, zustand, axios
   - 创建基础路由结构（/login, /upload, /chat）

4. 创建 docker-compose.yml（PostgreSQL 16 + Redis 7）

5. 创建 .env.example

6. 确保 docker-compose up -d 后，uvicorn 能启动并且 health check 返回 {"status": "ok"}

不要跳步，一步一步来，每完成一个 Task 在 PLAN.md 中勾选。
```

---

## 第二条指令（Day 2-3）

```
继续执行 PLAN.md 中的 Task 2.1 + Task 2.2。

创建数据库模型（User, Dataset, RefreshToken），初始化 Alembic，运行 migration，
然后实现完整的认证系统（login, refresh, logout, get_current_user middleware）。

按照 CLAUDE.md 中的 JWT 设计：
- Access Token 15 分钟，携带 role, region, partner_id, datasets[], pv, scope_desc
- Refresh Token 7 天，httpOnly cookie，服务端存储

创建 seed 脚本，生成默认 admin 用户。验证登录流程能跑通。
```

---

## 第三条指令（Day 4-5）

```
继续执行 PLAN.md 中的 Task 3.1 + Task 3.2 + Task 3.3。

实现 Excel/CSV 上传和 Schema Discovery：
1. POST /api/v1/datasets/upload 接受文件上传
2. 自动解析列名、数据类型、空值率、样本值
3. 将数据存入 DuckDB 表
4. 将元数据（schema_info）存入 PostgreSQL

然后创建 examples/sample_partner_data.xlsx（100 行假数据，包含 partner_name, region, tier, month, revenue, deal_count, product_line）。

验证：上传样本文件 → GET /api/v1/datasets/{id} 返回正确的 schema → GET /api/v1/datasets/{id}/preview 返回前 20 行。
```

---

## 第四条指令（Day 6-7）

```
继续执行 PLAN.md 中的 Task 4.1 + Task 4.2 + Task 4.3。

实现 AI 查询引擎：
1. ai_engine.py: 调用 Claude API，System Prompt 注入数据集元数据，返回 SQL + chart_type
2. query_executor.py: SQL 安全检查 + DuckDB 执行
3. POST /api/v1/query/ask endpoint

System Prompt 模板参考 docs/MetadataHub_Complete_Knowledge_Base.md 第三部分。
SQL 安全检查规则参考知识库第五部分的 SQLSafetyChecker。

验证：POST /api/v1/query/ask { "question": "各区域的总营收", "dataset_id": "..." } 返回正确的 SQL、数据和 chart_type。
```

---

## 第五条指令（Day 8-10）

```
继续执行 PLAN.md 中的 Task 5.1 + 5.2 + 5.3。

实现前端：
1. 登录页（调用 /auth/login，Zustand 管理 token）
2. 上传页（拖拽上传 Excel，显示 schema 预览，确认导入）
3. 对话页（核心）：
   - 顶部数据集选择器
   - 底部聊天输入框
   - AI 回复渲染：文字说明 + SQL 代码块 + ECharts 图表 + 数据表
   - ChartWidget 组件：根据 chart_type 和数据自动生成 ECharts option

重点是 ChartWidget：
- bar → 柱状图（x 轴 = 第一个字符串列，y 轴 = 第一个数值列）
- line → 折线图
- pie → 饼图
- table → Ant Design Table

验证完整流程：登录 → 上传 Excel → 对话提问 → 看到图表。
```
