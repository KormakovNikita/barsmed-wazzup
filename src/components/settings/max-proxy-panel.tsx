"use client";

export function MaxProxyPanel() {
  return (
    <div className="space-y-3 rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-900/40">
      <h3 className="font-semibold">Голосовые MAX — режим Wazzup</h3>

      <p className="text-muted-foreground">
        Для нативных голосовых (удержание кнопки) включите{" "}
        <code className="text-xs">MAX_INCOMING=wazzup</code> в настройках MAX
        выше. Wazzup подключает бота по токену и отдаёт аудио в webhook как{" "}
        <code className="text-xs">type: audio</code> +{" "}
        <code className="text-xs">contentUri</code>.
      </p>

      <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
        <p className="font-medium">Схема работы</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>Входящие MAX (включая голосовые) → Wazzup → HubDesk webhook</li>
          <li>Исходящие ответы → MAX Bot API (<code>MAX_BOT_TOKEN</code>)</li>
          <li>Bot API webhook/polling для входящих отключается автоматически</li>
        </ul>
      </div>

      <div className="rounded-md border bg-background p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Без Wazzup (MAX_INCOMING=bot)</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>Текст, фото, видео и файлы приходят через Bot API</li>
          <li>Нативные голосовые не передаются платформой ботам</li>
          <li>Альтернатива: клиент отправляет аудио как файл</li>
        </ul>
      </div>
    </div>
  );
}
