#!/bin/bash
# Deploy updated frontend to server
# Usage: ./deploy_web.sh <server_user>@<server_ip>
# Example: ./deploy_web.sh root@47.113.187.130

SERVER=${1:-"root@47.113.187.130"}
REMOTE_DIR="/root/metadatahub"

echo "=== Syncing web app to $SERVER ==="
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.git' \
  apps/web/ "$SERVER:$REMOTE_DIR/apps/web/"

echo "=== Rebuilding and restarting nginx container ==="
ssh "$SERVER" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml build nginx && docker compose -f docker-compose.prod.yml up -d nginx"

echo "=== Done! Frontend redeployed. ==="
