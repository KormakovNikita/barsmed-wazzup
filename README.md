# HubDesk

Омниканальный inbox для бизнес-коммуникаций — аналог Wazzup для вашей компании.

Объединяет переписку из WhatsApp, Telegram, MAX, VK и Instagram в одном окне с карточкой контакта, назначением операторов и фильтрацией по каналам.

## Возможности

- **Единый inbox** — все диалоги в одном списке с поиском
- **Telegram Bot** — входящие через webhook или long polling, исходящие через Bot API
- **MAX Messenger Bot** — webhook/polling, отправка через platform-api2.max.ru
- **Автораспределение диалогов** — по нагрузке (`least_loaded`) или по очереди (`round_robin`)
- **Чат** — отправка и получение сообщений, статусы доставки
- **Карточка контакта** — телефон, email, компания, теги, этап сделки
- **Назначение операторов** — вручную или автоматически

## Быстрый старт

```bash
cp .env.example .env.local
# Заполните TELEGRAM_BOT_TOKEN и/или MAX_BOT_TOKEN
npm install
npm run dev -- -p 43123
```

Откройте [http://localhost:43123/inbox](http://localhost:43123/inbox)

## Настройка Telegram

1. Создайте бота через [@BotFather](https://t.me/BotFather)
2. Добавьте токен в `.env.local`:
   ```
   TELEGRAM_BOT_TOKEN=123456:ABC...
   TELEGRAM_WEBHOOK_SECRET=your-secret
   ```

**Production (webhook):**
```bash
WEBHOOK_BASE_URL=https://your-domain.com
# Зарегистрировать webhook:
curl -X POST http://localhost:43123/api/integrations/status \
  -H "Content-Type: application/json" \
  -d '{"action":"register-webhooks"}'
```

**Локальная разработка (polling):**
```bash
npm run poll-bots
# или UI сам опрашивает /api/integrations/poll каждые 5 сек
```

Webhook endpoint: `POST /api/webhooks/telegram`

## Настройка MAX Messenger

1. Создайте бота на [dev.max.ru](https://dev.max.ru) или в «MAX для бизнеса»
2. Получите токен и добавьте в `.env.local`:
   ```
   MAX_BOT_TOKEN=your-max-token
   MAX_WEBHOOK_SECRET=hubdesk-max-secret
   MAX_API_BASE_URL=https://platform-api2.max.ru
   ```

**Production:** укажите `WEBHOOK_BASE_URL` и зарегистрируйте webhook (см. Telegram выше).

Webhook endpoint: `POST /api/webhooks/max`  
Проверка: заголовок `X-Max-Bot-Api-Secret`

## Автораспределение диалогов

При первом входящем сообщении из Telegram или MAX диалог автоматически назначается оператору.

Стратегии (переменная `ASSIGNMENT_STRATEGY`):

| Значение | Описание |
|----------|----------|
| `least_loaded` (по умолчанию) | Оператор с наименьшим числом открытых диалогов |
| `round_robin` | По очереди среди онлайн-операторов |

Приоритет — операторы со статусом `online`. Если все офлайн, выбирается из всего списка.

Ручное переназначение в карточке контакта сбрасывает флаг автоназначения.

## API

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/conversations` | Список диалогов |
| GET | `/api/conversations/:id` | Диалог с сообщениями |
| POST | `/api/conversations/:id/messages` | Отправить (→ Telegram/MAX) |
| PATCH | `/api/conversations/:id/assign` | Назначить оператора |
| POST | `/api/webhooks/telegram` | Webhook Telegram |
| POST | `/api/webhooks/max` | Webhook MAX |
| POST | `/api/integrations/poll` | Long polling (dev) |
| GET | `/api/integrations/status` | Статус интеграций |
| POST | `/api/integrations/status` | `register-webhooks` / `unregister-webhooks` |

## Стек

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS 4 + shadcn/ui

## Что дальше

- PostgreSQL для персистентного хранения
- WebSocket/SSE для real-time без polling
- WhatsApp Business API, VK, Instagram
- CRM-интеграция (amoCRM, Bitrix24)
