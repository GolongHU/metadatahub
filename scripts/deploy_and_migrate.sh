#!/usr/bin/env bash
# Deploy frontend + backend, run DB migrations
# Target: 内网服务器 10.2.38.146
set -e

SERVER=root@10.2.38.146
WEB_DIR=/opt/metadatahub-web
SERVER_DIR=/opt/metadatahub-server
ALEMBIC=/opt/pyenv/bin/alembic
UVICORN=/opt/pyenv/bin/uvicorn

echo "=== 1. Building frontend ==="
cd apps/web && pnpm build && cd ../..

echo "=== 2. Syncing frontend dist ==="
rsync -avz --delete apps/web/dist/ $SERVER:$WEB_DIR/

echo "=== 3. Syncing backend ==="
rsync -avz apps/server/app/      $SERVER:$SERVER_DIR/app/
rsync -avz apps/server/alembic/  $SERVER:$SERVER_DIR/alembic/
rsync -avz apps/server/scripts/  $SERVER:$SERVER_DIR/scripts/ 2>/dev/null || true

echo "=== 4. Running DB migrations ==="
ssh $SERVER "cd $SERVER_DIR && $ALEMBIC upgrade head"

echo "=== 5. Restarting API ==="
ssh $SERVER "pkill -f uvicorn || true; sleep 2; \
  cd $SERVER_DIR && nohup $UVICORN app.main:app \
  --host 0.0.0.0 --port 8000 --workers 2 \
  >> /var/log/metadatahub-api.log 2>&1 &"

sleep 4

echo "=== 6. Health check ==="
curl -s http://10.2.38.146/api/v1/health

echo ""
echo "=== Deploy complete ==="
