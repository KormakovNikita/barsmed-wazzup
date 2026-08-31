#!/usr/bin/env bash
set -euo pipefail

echo "=== HubDesk full deploy ==="

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ca-certificates 2>/dev/null || apt-get install -y git curl ca-certificates

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker && systemctl start docker
fi

# Swap as safety net (even on 4GB)
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

mkdir -p /opt/hubdesk
cd /opt/hubdesk
tar xzf /tmp/hubdesk-deploy.tar.gz
rm -f /tmp/hubdesk-deploy.tar.gz

if [ ! -f .env.local ]; then
  cp .env.example .env.local
  cat >> .env.local << 'EOF'

TELEGRAM_MODE=user
WEBHOOK_BASE_URL=
EOF
fi

docker compose down 2>/dev/null || true
docker builder prune -af 2>/dev/null || true

echo "=== Building (webpack, ~3-8 min) ==="
docker compose build --progress=plain
docker compose up -d

ufw allow 22/tcp 2>/dev/null || true
ufw allow 3000/tcp 2>/dev/null || true
echo "y" | ufw enable 2>/dev/null || true

sleep 5
docker compose ps
HTTP=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/inbox || echo 000)
echo "INBOX_HTTP:$HTTP"
echo "DEPLOY_DONE"
