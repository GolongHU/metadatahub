#!/bin/bash
# MetadataHub — Production Deployment Script
# Run on the server: bash /opt/metadatahub/scripts/deploy.sh
set -e

DEPLOY_DIR="/opt/metadatahub"
cd "$DEPLOY_DIR"

echo "==> [1/5] Generating JWT secret..."
JWT_SECRET=$(openssl rand -hex 32)
sed -i "s/REPLACE_WITH_RANDOM_256BIT_SECRET/$JWT_SECRET/" .env.prod
echo "    JWT_SECRET_KEY set."

echo "==> [2/5] Building images..."
docker compose -f docker-compose.prod.yml build --no-cache

echo "==> [3/5] Starting infrastructure (PG + Redis)..."
docker compose -f docker-compose.prod.yml up -d postgres redis
echo "    Waiting for PG to be healthy..."
until docker exec mh_postgres pg_isready -U metadatahub -d metadatahub &>/dev/null; do
  sleep 2
done
echo "    PostgreSQL ready."

echo "==> [4/5] Running database migrations..."
docker compose -f docker-compose.prod.yml run --rm api \
  sh -c "cd /app && python -m alembic upgrade head"

echo "==> [5/5] Seeding admin user..."
docker compose -f docker-compose.prod.yml run --rm api \
  sh -c "cd /app && python scripts/seed.py"

echo "==> Starting all services..."
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║  MetadataHub deployed successfully!        ║"
echo "║  URL: http://47.113.187.130:3000           ║"
echo "║  Login: admin@metadatahub.local / admin123 ║"
echo "╚════════════════════════════════════════════╝"

echo ""
echo "NOTE: Don't forget to set ANTHROPIC_API_KEY in .env.prod"
echo "      then restart: docker compose -f docker-compose.prod.yml restart api"
