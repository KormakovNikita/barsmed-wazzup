#!/usr/bin/env bash
# Fix OOM/hang during next build on small VPS
set -euo pipefail

echo "=== Adding 2GB swap (if missing) ==="
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=progress
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Swap enabled"
else
  echo "Swap already active"
fi
swapon --show
free -h

echo ""
echo "=== Stopping stuck build ==="
cd /opt/hubdesk 2>/dev/null || { echo "Run from /opt/hubdesk"; exit 1; }
docker compose down 2>/dev/null || true
docker builder prune -f 2>/dev/null || true

echo ""
echo "=== Rebuild (webpack, ~5-10 min on 1GB RAM) ==="
export DOCKER_BUILDKIT=1
docker compose build --no-cache --progress=plain 2>&1 | tee /tmp/hubdesk-build.log
docker compose up -d

sleep 3
docker compose ps
curl -s -o /dev/null -w "HTTP: %{http_code}\n" http://127.0.0.1:3000/inbox || true

echo ""
echo "Done. Open http://161.104.18.207:3000/inbox"
