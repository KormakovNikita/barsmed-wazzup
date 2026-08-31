# HubDesk

Омниканальный inbox для бизнес-коммуникаций — аналог Wazzup для вашей компании.

## Возможности

- **Исходящие сообщения** — пишите клиентам первыми из inbox или через «Написать клиенту»
- **Telegram (личный аккаунт)** — переписка от имени аккаунта компании через MTProto, не бота
- **MAX Messenger Bot** — приём и отправка через Bot API
- **Автораспределение диалогов** — по нагрузке или по очереди
- **Единый inbox** — все каналы в одном окне

## Быстрый старт

```bash
cp .env.example .env.local
npm install
npm run dev -- -p 43123
```

Откройте [http://localhost:43123/inbox](http://localhost:43123/inbox)

## Telegram — личный аккаунт компании

1. Получите **API ID** и **API Hash** на [my.telegram.org](https://my.telegram.org)
2. Добавьте в `.env.local`:

```
TELEGRAM_MODE=user
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=abcdef1234567890
```

3. Откройте [Настройки → Интеграции](/settings/integrations) и войдите по номеру телефона рабочего аккаунта
4. Сессия сохранится в `.data/telegram-session.txt`

После подключения:
- входящие сообщения клиентов приходят в inbox автоматически
- ваши ответы уходят **от имени аккаунта компании**, как в обычном Telegram
- можно написать клиенту первым: кнопка **«Написать клиенту»** → `@username` или номер телефона

> Бот-режим (`TELEGRAM_BOT_TOKEN`) остаётся как fallback при `TELEGRAM_MODE=bot`.

## MAX Messenger

```
MAX_BOT_TOKEN=your-token
MAX_API_BASE_URL=https://platform-api2.max.ru
```

Webhook: `POST /api/webhooks/max`

## API

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/conversations/start` | Написать клиенту первым |
| POST | `/api/conversations/:id/messages` | Ответ в диалоге |
| POST | `/api/integrations/telegram/auth/send-code` | Запросить код Telegram |
| POST | `/api/integrations/telegram/auth/sign-in` | Войти в аккаунт |
| GET | `/api/integrations/telegram/auth/status` | Статус подключения |

## Стек

Next.js 16 · TypeScript · teleproto (MTProto) · Tailwind · shadcn/ui
