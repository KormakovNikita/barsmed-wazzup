# Деплой HubDesk на облачный сервер

## Что понадобится

- VPS с Ubuntu 22.04/24.04 (1 GB RAM минимум, лучше 2 GB)
- SSH-доступ (`root` или пользователь с sudo)
- Домен (опционально, для HTTPS и webhook MAX)

---

## Быстрый деплой (Docker)

### 1. Подключитесь к серверу

```bash
ssh root@IP_ВАШЕГО_СЕРВЕРА
```

### 2. Запустите скрипт установки

```bash
curl -fsSL https://raw.githubusercontent.com/KormakovNikita/barsmed-wazzup/main/scripts/deploy-server.sh | bash
```

Или вручную:

```bash
apt update && apt install -y git
git clone https://github.com/KormakovNikita/barsmed-wazzup.git /opt/hubdesk
cd /opt/hubdesk
cp .env.example .env.local
nano .env.local   # заполните переменные
docker compose up -d --build
```

### 3. Настройте `.env.local`

```env
TELEGRAM_MODE=user
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=abcdef...

# Если есть домен с HTTPS:
WEBHOOK_BASE_URL=https://hubdesk.ваш-домен.ru

# MAX (если нужен):
MAX_BOT_TOKEN=ваш_токен
MAX_WEBHOOK_SECRET=hubdesk-max-secret
MAX_API_BASE_URL=https://platform-api2.max.ru

# Без домена polling работает автоматически.
# С доменом lk.mrtkt.ru:
# WEBHOOK_BASE_URL=https://lk.mrtkt.ru
```

Подробнее про MAX — в README, раздел «MAX Messenger».

### 4. Откройте в браузере

```
http://IP_СЕРВЕРА:3000/inbox
```

Подключите Telegram: `/settings/integrations`

---

## HTTPS с Nginx + Let's Encrypt (рекомендуется)

```bash
apt install -y nginx certbot python3-certbot-nginx

cat > /etc/nginx/sites-available/hubdesk <<'EOF'
server {
    listen 80;
    server_name hubdesk.ваш-домен.ru;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

ln -sf /etc/nginx/sites-available/hubdesk /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

certbot --nginx -d hubdesk.ваш-домен.ru
```

После получения сертификата обновите `.env.local`:

```env
WEBHOOK_BASE_URL=https://hubdesk.ваsh-домен.ru
```

Перезапуск:

```bash
cd /opt/hubdesk && docker compose restart
```

---

## Полезные команды

```bash
cd /opt/hubdesk

# Логи
docker compose logs -f

# Перезапуск
docker compose restart

# Обновление с GitHub
git pull origin main
docker compose up -d --build

# Статус
docker compose ps
```

---

## Важно

- **Telegram-сессия** хранится в Docker volume `hubdesk-data` — не удаляйте volume
- Откройте порт **3000** в firewall облака (Security Group / UFW)
- После деплоя **отзовите** токены, если публиковали их в чатах

### UFW (firewall на сервере)

```bash
ufw allow 22
ufw allow 80
ufw allow 443
ufw allow 3000
ufw enable
```

---

## Windows → загрузка через SCP (альтернатива git clone)

Если репозиторий уже скачан локально:

```powershell
scp -r C:\Users\Мария\barsmed-wazzup root@IP_СЕРВЕРА:/opt/hubdesk
```

На сервере:

```bash
cd /opt/hubdesk
cp .env.example .env.local
nano .env.local
docker compose up -d --build
```
