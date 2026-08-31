#!/usr/bin/env bash
set -euo pipefail

# HubDesk — деплой на Ubuntu/Debian VPS
# Запуск на сервере: bash scripts/deploy-server.sh

APP_DIR="${APP_DIR:-/opt/hubdesk}"
REPO_URL="${REPO_URL:-https://github.com/KormakovNikita/barsmed-wazzup.git}"
BRANCH="${BRANCH:-main}"

echo "==> HubDesk deploy to ${APP_DIR}"

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin required. Install docker-compose-plugin."
  exit 1
fi

mkdir -p "$(dirname "$APP_DIR")"

if [ ! -d "$APP_DIR/.git" ]; then
  echo "==> Cloning repository..."
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  echo "==> Updating repository..."
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
fi

cd "$APP_DIR"

if [ ! -f .env.local ]; then
  echo "==> Creating .env.local from example..."
  cp .env.example .env.local
  echo ""
  echo "!!! Отредактируйте ${APP_DIR}/.env.local перед запуском:"
  echo "    nano ${APP_DIR}/.env.local"
  echo ""
  echo "Обязательно задайте:"
  echo "  TELEGRAM_API_ID, TELEGRAM_API_HASH"
  echo "  WEBHOOK_BASE_URL=https://ваш-домен.ru  (если есть домен)"
  echo ""
  read -r -p "Нажмите Enter после редактирования .env.local..."
fi

echo "==> Building and starting containers..."
docker compose down 2>/dev/null || true
docker compose build --no-cache
docker compose up -d

echo ""
echo "==> Deploy complete!"
echo "    App: http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_SERVER_IP'):3000"
echo "    Inbox: /inbox"
echo "    Integrations: /settings/integrations"
echo ""
echo "Logs: docker compose -f ${APP_DIR}/docker-compose.yml logs -f"
