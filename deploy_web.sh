#!/bin/bash
# Deploy frontend to 内网服务器
# Usage: ./deploy_web.sh

SERVER=root@10.2.38.146
WEB_DIR=/opt/metadatahub-web

echo "=== 1. Building frontend ==="
cd apps/web && pnpm build && cd ../..

echo "=== 2. Syncing dist to $SERVER ==="
rsync -avz --delete apps/web/dist/ $SERVER:$WEB_DIR/

echo "=== Done! Frontend deployed to http://10.2.38.146 ==="
