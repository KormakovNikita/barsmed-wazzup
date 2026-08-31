#!/usr/bin/env bash
# HubDesk — установка на сервер БЕЗ домена
# IP: 161.104.18.207
# Запуск на сервере после: ssh root@161.104.18.207

set -euo pipefail

APP_DIR="/opt/hubdesk"
REPO="https://github.com/KormakovNikita/barsmed-wazzup.git"

echo "=== HubDesk install ==="

# Docker
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker && systemctl start docker
fi

# Clone / update
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull origin main
else
  git clone "$REPO" "$APP_DIR"
fi

cd "$APP_DIR"

# Env
if [ ! -f .env.local ]; then
  cp .env.example .env.local
fi

# Без домена webhook не нужен — Telegram user mode слушает через MTProto
if ! grep -q "WEBHOOK_BASE_URL" .env.local 2>/dev/null; then
  echo "" >> .env.local
  echo "# Без домена — оставьте пустым" >> .env.local
  echo "WEBHOOK_BASE_URL=" >> .env.local
fi

# Build & run
docker compose down 2>/dev/null || true
docker compose up -d --build

echo ""
echo "============================================"
echo "  HubDesk запущен!"
echo "  Inbox:        http://161.104.18.207:3000/inbox"
echo "  Интеграции:   http://161.104.18.207:3000/settings/integrations"
echo "============================================"
echo ""
echo "Не забудьте:"
echo "  1. Открыть порт 3000 в firewall облака"
echo "  2. Заполнить TELEGRAM_API_ID и TELEGRAM_API_HASH в .env.local"
echo "     nano /opt/hubdesk/.env.local && docker compose restart"
echo ""
docker compose ps
