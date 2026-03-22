FROM python:3.12-slim

WORKDIR /app

# Install Python deps using pre-built binary wheels (no compilation needed)
COPY pyproject.toml ./
RUN pip install --no-cache-dir -i https://mirrors.aliyun.com/pypi/simple/ \
    --upgrade pip setuptools wheel \
 && pip install --no-cache-dir --prefer-binary \
    -i https://mirrors.aliyun.com/pypi/simple/ \
    fastapi uvicorn[standard] sqlalchemy[asyncio] asyncpg alembic \
    "python-jose[cryptography]" pydantic-settings anthropic openpyxl \
    duckdb "redis[hiredis]" python-multipart argon2-cffi email-validator httpx openai

# Copy source
COPY . .

RUN mkdir -p uploads

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "1", "--log-level", "info"]
