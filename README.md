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

## Telegram — аккаунт компании (через Wazzup)

**Клиенты пишут в ваш рабочий Telegram, не в бота.** my.telegram.org не нужен.

1. В [Wazzup](https://wazzup24.com) подключите **личный Telegram** (раздел «Каналы»)
2. Скопируйте API-ключ: Настройки → Интеграция → API
3. Добавьте в `.env.local`:

```
TELEGRAM_MODE=wazzup
WAZZUP_API_KEY=ваш_ключ
WEBHOOK_BASE_URL=https://lk.mrtkt.ru
```

4. Перезапустите и нажмите «Зарегистрировать webhook Wazzup» в [Настройках](/settings/integrations)

HubDesk получает сообщения через Wazzup webhook и отправляет ответы от имени вашего аккаунта компании.

## Telegram — бот (@BotFather)

Только если клиенты специально пишут **боту**. Не подходит, если пишут в аккаунт компании.

```
TELEGRAM_MODE=user
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=abcdef1234567890
```

Затем [Настройки → Интеграции](/settings/integrations) → войдите по номеру телефона.

После подключения:
- входящие приходят автоматически
- ответы уходят **от имени аккаунта компании**
- можно написать первым через «Написать клиенту»

## MAX Messenger

Подключение через **бота** компании (не личный аккаунт). Нужно верифицированное юрлицо или ИП на [business.max.ru](https://business.max.ru).

### 1. Создайте бота

1. Зарегистрируйте организацию на [business.max.ru](https://business.max.ru)
2. Чат-боты → **Создать** → заполните карточку → дождитесь модерации
3. Скопируйте **токен**: Чат-боты → ваш бот → Расширенные настройки → Настроить

### 2. Добавьте токен на сервер

В `/opt/hubdesk/.env.local`:

```env
MAX_BOT_TOKEN=ваш_токен_из_MAX
MAX_WEBHOOK_SECRET=hubdesk-max-secret
MAX_API_BASE_URL=https://platform-api2.max.ru
```

Перезапуск:

```bash
cd /opt/hubdesk && docker compose restart
```

### 3. Проверьте подключение

Откройте [Настройки → Интеграции](/settings/integrations) — должен появиться статус бота.

### Режимы получения сообщений

| Режим | Когда | Что нужно |
|-------|-------|-----------|
| **Polling** | Нет HTTPS-домена | Только `MAX_BOT_TOKEN` — HubDesk опрашивает MAX каждые 5 сек |
| **Webhook** | Есть домен с HTTPS | `WEBHOOK_BASE_URL=https://lk.mrtkt.ru` + nginx + certbot |

Для webhook после настройки HTTPS нажмите **«Зарегистрировать webhook»** в настройках или перезапустите контейнер.

### Как протестировать

1. Найдите бота в MAX по ссылке из карточки (например `max.ru/idИНН_bot`)
2. Напишите боту любое сообщение
3. Через несколько секунд диалог появится во [Входящих](/inbox) с каналом MAX
4. Ответьте из inbox — сообщение уйдёт клиенту в MAX

Webhook endpoint: `POST /api/webhooks/max`

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
