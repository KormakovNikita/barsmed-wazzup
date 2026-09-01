"use client";

export function MaxProxyPanel() {
  return (
    <div className="space-y-3 rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-900/40">
      <h3 className="font-semibold">Голосовые в MAX (только бот)</h3>
      <p className="text-muted-foreground">
        У вас подключён <strong>только чат-бот</strong> через{" "}
        <code className="text-xs">MAX_BOT_TOKEN</code> — это правильная схема
        для business.max.ru. Отдельный «MAX Proxy» с QR-входом{" "}
        <strong>не нужен</strong> и не подходит: он рассчитан на личный
        аккаунт MAX сотрудника, а не на бота.
      </p>
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
        <p className="font-medium">Ограничение платформы MAX</p>
        <p className="mt-1">
          Нативные голосовые (удержание кнопки записи){" "}
          <strong>не передаются в Bot API</strong>. HubDesk получает через бота:
          текст, фото, видео, документы и{" "}
          <strong>аудио, отправленное как файл</strong>.
        </p>
        <p className="mt-2">
          Попросите клиента не записывать голосовое, а прикрепить аудио через
          «Файл» / «Документ» — тогда сообщение появится в inbox и его можно
          будет прослушать.
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Обойти это без личного аккаунта или посредника (Wazzup) сейчас нельзя —
        только если VK/MAX добавят голосовые в Bot API. Можно написать в
        поддержку business.max.ru с запросом на поддержку voice для ботов.
      </p>
    </div>
  );
}
