# HubDesk

Омниканальный inbox для бизнес-коммуникаций — аналог Wazzup для вашей компании.

Объединяет переписку из WhatsApp, Telegram, VK и Instagram в одном окне с карточкой контакта, назначением операторов и фильтрацией по каналам.

## Возможности (MVP)

- **Единый inbox** — все диалоги в одном списке с поиском
- **Мультиканальность** — WhatsApp, Telegram, VK, Instagram
- **Чат** — отправка и получение сообщений, статусы доставки
- **Карточка контакта** — телефон, email, компания, теги, этап сделки
- **Назначение операторов** — распределение диалогов между менеджерами
- **Фильтр по каналам** — быстрый доступ к нужному мессенджеру
- **Демо входящих** — кнопка «Тест входящего» для проверки UI без реальных API

## Запуск локально

```bash
npm install
npm run dev -- -p 43123
```

Откройте [http://localhost:43123/inbox](http://localhost:43123/inbox)

## Архитектура

```
src/
├── app/
│   ├── api/              # REST API (диалоги, сообщения, симуляция)
│   └── inbox/            # Главный экран
├── components/inbox/     # UI-компоненты
└── lib/
    ├── store.ts          # In-memory хранилище (демо-данные)
    ├── types.ts          # Типы
    └── channels.ts       # Конфигурация каналов
```

## Что дальше для production

1. **База данных** — PostgreSQL + Prisma для контактов, диалогов, сообщений
2. **Real-time** — WebSocket/SSE для мгновенной доставки сообщений
3. **Интеграции мессенджеров:**
   - WhatsApp Business API (Meta Cloud API или провайдер)
   - Telegram Bot API / Telegram Business
   - VK API (Callback API)
   - Instagram Messaging API
4. **CRM-интеграция** — webhook'и и API для amoCRM, Bitrix24
5. **Авторизация** — роли (оператор, супервизор, админ)
6. **Очереди** — автоматическое распределение диалогов
7. **Шаблоны и быстрые ответы**

## API (демо)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/conversations` | Список диалогов |
| GET | `/api/conversations/:id` | Диалог с сообщениями |
| POST | `/api/conversations/:id/messages` | Отправить сообщение |
| PATCH | `/api/conversations/:id/assign` | Назначить оператора |
| POST | `/api/simulate/incoming` | Симуляция входящего |
| GET | `/api/stats` | Статистика и операторы |

## Стек

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS 4
- shadcn/ui
