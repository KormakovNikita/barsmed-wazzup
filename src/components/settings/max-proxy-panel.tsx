"use client";

export function MaxProxyPanel() {
  return (
    <div className="space-y-3 rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-900/40">
      <h3 className="font-semibold">Голосовые в MAX — только через бота</h3>

      <p className="text-muted-foreground">
        Wazzup для MAX-бота подключается <strong>только токеном бота</strong> —
        как у вас. Но голосовые они получают не «магией API», а через{" "}
        <strong>свою партнёрскую инфраструктуру MAX</strong>: их серверы
        обрабатывают сообщения бота, скачивают аудио и отдают ссылку{" "}
        <code className="text-xs">contentUri</code> на store.wazzup24.com.
        Это закрытый канал интегратора, его нельзя повторить только с{" "}
        <code className="text-xs">MAX_BOT_TOKEN</code> без статуса партнёра MAX.
      </p>

      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
        <p className="font-medium">Что HubDesk делает с одним ботом (без Wazzup)</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            Слушает <code>message_created</code> и{" "}
            <code>message_edited</code> — иногда медиа приходит с задержкой
          </li>
          <li>
            Дозапрашивает сообщение через GET /messages/&#123;mid&#125; и
            повторяет загрузку
          </li>
          <li>
            Сохраняет аудио/файлы на своём сервере (аналог contentUri —{" "}
            <code>/api/media/…</code>)
          </li>
          <li>
            Если MAX отдаёт транскрипцию аудио — показывает текст
          </li>
        </ul>
        <p className="mt-2">
          Нативные голосовые (удержание кнопки){" "}
          <strong>MAX Bot API не передаёт</strong> — мы проверяли на production:
          в истории 1300+ сообщений бота нет ни одного voice/audio от клиентов.
        </p>
      </div>

      <div className="rounded-md border bg-background p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Рабочие варианты сейчас</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            Клиент отправляет аудио <strong>как файл</strong> (не голосовое) —
            приходит в inbox
          </li>
          <li>
            Запрос в поддержку business.max.ru: «voice для Bot API» или
            «статус технологического партнёра» (как у Wazzup)
          </li>
        </ul>
      </div>
    </div>
  );
}
