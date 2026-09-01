"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MaxProfile {
  userId: number;
  name: string;
  username?: string;
}

interface MaxWazzupRelay {
  configured: boolean;
  connected: boolean;
  channelId: string | null;
  channelName: string | null;
  transport: string | null;
  webhookUrl: string | null;
  error?: string | null;
}

interface MaxStatus {
  configured: boolean;
  connected: boolean;
  incomingMode?: "bot" | "wazzup";
  mode: "webhook" | "polling" | "hybrid";
  profile: MaxProfile | null;
  error?: string | null;
  webhookBaseUrl?: string | null;
  webhooks?: { url: string }[];
  wazzupRelay?: MaxWazzupRelay | null;
}

export function MaxConnectPanel() {
  const [status, setStatus] = useState<MaxStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/status");
      const data = await res.json();
      setStatus({
        configured: data.max?.configured ?? false,
        connected: data.max?.connected ?? false,
        incomingMode: data.max?.incomingMode ?? "bot",
        mode: data.max?.mode ?? "polling",
        profile: data.max?.profile ?? null,
        error: data.max?.error ?? null,
        webhookBaseUrl: data.webhookBaseUrl ?? null,
        webhooks: data.max?.webhooks ?? [],
        wazzupRelay: data.max?.wazzupRelay ?? null,
      });
    } catch {
      setError("Не удалось загрузить статус MAX");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function handleSyncHistory() {
    setActionLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/max/sync-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "max" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка синхронизации");

      const max = data.results?.max;

      if (max?.details?.length) {
        setMessage(
          `MAX: ${max.imported} сообщений в ${max.conversations} диалогах`,
        );
      } else {
        setMessage("Синхронизация MAX завершена");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleClearWebhooks() {
    setActionLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear-max-webhooks" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      setMessage("Чужие webhook отключены — HubDesk получит новые сообщения через polling");
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRegisterWebhook() {
    setActionLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register-webhooks" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка регистрации webhook");

      if (data.results?.wazzupMax?.ok) {
        setMessage("Webhook Wazzup для MAX (голосовые) зарегистрирован");
      } else if (data.results?.max?.ok) {
        setMessage("Webhook MAX зарегистрирован");
      } else if (data.results?.max?.error) {
        throw new Error(data.results.max.error);
      } else {
        setMessage("Запрос выполнен");
      }
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Проверяем MAX…
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">MAX Messenger</h2>
          <p className="text-sm text-muted-foreground">
            Бот компании для приёма и отправки сообщений в MAX
          </p>
        </div>
        {status?.connected ? (
          <CheckCircle2 className="size-6 shrink-0 text-green-600" />
        ) : status?.configured ? (
          <XCircle className="size-6 shrink-0 text-destructive" />
        ) : null}
      </div>

      {status?.connected && status.profile ? (
        <div className="space-y-3">
          <div className="rounded-md border bg-background p-3 text-sm">
            <p className="font-medium">{status.profile.name}</p>
            {status.profile.username && (
              <p className="text-muted-foreground">@{status.profile.username}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Режим входящих:{" "}
              {status.incomingMode === "wazzup"
                ? status.mode === "hybrid"
                  ? "Bot API + Wazzup (голосовые)"
                  : "Bot API polling + Wazzup"
                : status.mode === "webhook"
                  ? "Bot API webhook"
                  : "Bot API polling"}
            </p>
            {status.incomingMode === "wazzup" && status.wazzupRelay?.connected && (
              <p className="mt-1 text-xs text-muted-foreground">
                Wazzup канал: {status.wazzupRelay.channelName ?? status.wazzupRelay.channelId}
                {status.wazzupRelay.transport ? ` (${status.wazzupRelay.transport})` : ""}
              </p>
            )}
          </div>
          <Button
            variant="default"
            size="sm"
            disabled={actionLoading}
            onClick={handleSyncHistory}
          >
            {actionLoading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Загрузка истории…
              </>
            ) : (
              "Загрузить историю переписок MAX"
            )}
          </Button>
          <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm dark:border-sky-900 dark:bg-sky-950/30">
            <p className="font-medium text-sky-950 dark:text-sky-100">
              Голосовые на бота MAX
            </p>
            <p className="mt-1 text-xs text-sky-900 dark:text-sky-200">
              Bot API MAX не отдаёт нативные голосовые ботам. Подключите канал{" "}
              <strong>maxbot</strong> в Wazzup и задайте в{" "}
              <code>.env.local</code>:
            </p>
            <pre className="mt-2 overflow-x-auto rounded bg-background p-2 text-xs">
              MAX_INCOMING=wazzup{"\n"}
              WAZZUP_API_KEY=ваш_ключ{"\n"}
              WEBHOOK_BASE_URL=https://ваш-домен.ru
            </pre>
            <p className="mt-2 text-xs text-sky-900 dark:text-sky-200">
              Текст и медиа приходят через <strong>Bot API</strong>, голосовые —
              дополнительно через Wazzup webhook. Ответы отправляются через{" "}
              <strong>MAX_BOT_TOKEN</strong>.
            </p>
            {status.incomingMode === "wazzup" && !status.wazzupRelay?.connected && (
              <p className="mt-2 text-xs text-destructive">
                {status.wazzupRelay?.error ??
                  "Wazzup relay не подключён — проверьте WAZZUP_API_KEY и канал maxbot"}
              </p>
            )}
          </div>
          {status.incomingMode !== "wazzup" && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
              <p className="font-medium text-amber-900 dark:text-amber-100">
                Сейчас: только Bot API
              </p>
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                Текст, фото, видео и файлы приходят. Нативные голосовые (удержание
                кнопки) — нет. Для них включите режим Wazzup выше.
              </p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Загружает историю из MAX API для всех известных диалогов. Для старых
            переписок из Wazzup добавьте <code>WAZZUP_API_KEY</code> и нажмите
            «Загрузить историю».
          </p>
        </div>
      ) : status?.configured ? (
        <p className="text-sm text-destructive">
          Токен задан, но бот не отвечает: {status.error ?? "проверьте MAX_BOT_TOKEN"}
        </p>
      ) : (
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            Зарегистрируйте организацию на{" "}
            <a
              className="text-primary underline"
              href="https://business.max.ru"
              target="_blank"
              rel="noreferrer"
            >
              business.max.ru
            </a>{" "}
            (нужно верифицированное юрлицо или ИП)
          </li>
          <li>Создайте чат-бота и дождитесь модерации</li>
          <li>
            Скопируйте токен: Чат-боты → ваш бот → Расширенные настройки →
            Настроить
          </li>
          <li>
            На сервере в <code className="text-xs">/opt/hubdesk/.env.local</code>{" "}
            добавьте:
            <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-xs">
              MAX_BOT_TOKEN=ваш_токен{"\n"}
              MAX_WEBHOOK_SECRET=hubdesk-max-secret
            </pre>
          </li>
          <li>Перезапустите: <code className="text-xs">docker compose restart</code></li>
        </ol>
      )}

      {status?.webhooks && status.webhooks.length > 0 && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
          <p className="font-medium text-amber-900 dark:text-amber-100">
            Сообщения уходят на чужие webhook — HubDesk их не видит
          </p>
          <ul className="list-inside list-disc text-xs text-amber-800 dark:text-amber-200">
            {status.webhooks.map((sub) => (
              <li key={sub.url} className="break-all">
                {sub.url}
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            size="sm"
            disabled={actionLoading}
            onClick={handleClearWebhooks}
          >
            Отключить чужие webhook
          </Button>
        </div>
      )}

      {status?.webhookBaseUrl ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {status.incomingMode === "wazzup"
              ? `Webhook URL: ${status.webhookBaseUrl}/api/webhooks/wazzup`
              : `Webhook URL: ${status.webhookBaseUrl}/api/webhooks/max`}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={!status?.connected || actionLoading}
            onClick={handleRegisterWebhook}
          >
            {actionLoading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Регистрация…
              </>
            ) : status.incomingMode === "wazzup" ? (
              "Зарегистрировать Wazzup webhook"
            ) : (
              "Зарегистрировать webhook"
            )}
          </Button>
        </div>
      ) : status?.incomingMode === "wazzup" ? (
        <p className="text-xs text-destructive">
          Для голосовых через Wazzup нужен HTTPS: задайте{" "}
          <code>WEBHOOK_BASE_URL=https://ваш-домен.ru</code>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Без HTTPS (домена) HubDesk получает сообщения через polling каждые 5 сек —
          достаточно для начала. Для production укажите{" "}
          <code>WEBHOOK_BASE_URL=https://ваш-домен.ru</code>.
        </p>
      )}

      {message && <p className="text-sm text-green-700">{message}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button variant="ghost" size="sm" onClick={loadStatus}>
        Обновить статус
      </Button>
    </div>
  );
}
