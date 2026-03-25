#!/usr/bin/env bash
# Deploy frontend + backend, run DB migrations, verify
set -e

SERVER=root@47.113.187.130
APP_DIR=/opt/metadatahub

echo "=== 1. Syncing frontend dist ==="
rsync -avz --delete apps/web/dist/ $SERVER:$APP_DIR/apps/web/dist/
ssh $SERVER "docker cp $APP_DIR/apps/web/dist/. mh_nginx:/usr/share/nginx/html/"

echo "=== 2. Syncing backend ==="
rsync -avz apps/server/app/ $SERVER:$APP_DIR/apps/server/app/
rsync -avz apps/server/alembic/ $SERVER:$APP_DIR/apps/server/alembic/
rsync -avz apps/server/scripts/ $SERVER:$APP_DIR/apps/server/scripts/ 2>/dev/null || true

echo "=== 3. Copying app into container ==="
ssh $SERVER "docker cp $APP_DIR/apps/server/app/. mh_api:/app/app/"
ssh $SERVER "docker cp $APP_DIR/apps/server/alembic/. mh_api:/app/alembic/"

echo "=== 4. Running DB migrations ==="
ssh $SERVER "docker exec mh_api alembic upgrade head"

echo "=== 5. Checking seed data ==="
PARTNER_COUNT=$(ssh $SERVER "docker exec mh_api python3 -c \"
import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import text

async def check():
    async with AsyncSessionLocal() as s:
        r = await s.execute(text('SELECT COUNT(*) FROM partners'))
        print(r.scalar())

asyncio.run(check())
\"" 2>&1)
echo "Partners in DB: $PARTNER_COUNT"

if [ "$PARTNER_COUNT" = "0" ] || [ -z "$PARTNER_COUNT" ]; then
    echo "=== 5a. Running seed script ==="
    ssh $SERVER "docker exec mh_api python3 /app/scripts/seed_partners.py" || \
    ssh $SERVER "docker exec mh_api python3 scripts/seed_partners.py" || \
    echo "WARNING: Seed script not found or failed"
fi

echo "=== 6. Restarting API ==="
ssh $SERVER "docker restart mh_api"
sleep 5

echo "=== 7. Health check ==="
API_IP=$(ssh $SERVER "docker inspect mh_api --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'")
ssh $SERVER "curl -s http://$API_IP:8000/api/v1/health"

echo ""
echo "=== Deploy complete ==="
