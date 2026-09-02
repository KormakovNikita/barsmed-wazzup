"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TelegramProfile {
  id?: string;
  name: string;
  username?: string;
}

interface TelegramStatus {
  configured: boolean;
  connected: boolean;
  mode: "user" | "polling" | "webhook";
  profile: TelegramProfile | null;
  error?: string | null;
  webhookBaseUrl?: string | null;
  webhooks?: { url: string }[];
}

export function TelegramConnectPanel() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
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
        configured: data.telegram?.configured ?? false,
        connected: data.telegram?.connected ?? false,
        mode: data.telegram?.mode ?? "polling",
        profile: data.telegram?.profile ?? null,
        error: data.telegram?.error ?? null,
        webhookBaseUrl: data.webhookBaseUrl ?? null,
        webhooks: data.telegram?.webhooks ?? [],
      });
    } catch {
      setError("Не удалось загрузить статус Telegram");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function handleClearWebhook() {
    setActionLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear-telegram-webhook" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      setMessage(
        "Webhook отключён — сообщения будут получены через polling",
      );
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
      if (!res.ok) throw new Error(data.error ?? "Ошибка");

      if (data.results?.telegram?.ok) {
        setMessage("Webhook Telegram зарегистрирован");
      } else if (data.results?.telegram?.error) {
        throw new Error(data.results.telegram.error);
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
        Проверяем Telegram…
      </div>
    );
  }

  const isBotMode = status?.mode === "polling" || status?.mode === "webhook";

  return (
    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Telegram — бот</h2>
          <p className="text-sm text-muted-foreground">
            Рекомендуется: не нужен my.telegram.org, только токен от @BotFather
          </p>
        </div>
        {status?.connected ? (
          <CheckCircle2 className="size-6 shrink-0 text-green-600" />
        ) : status?.configured ? (
          <XCircle className="size-6 shrink-0 text-destructive" />
        ) : null}
      </div>

      {status?.connected && status.profile ? (
        <div className="rounded-md border bg-background p-3 text-sm">
          <p className="font-medium">{status.profile.name}</p>
          {status.profile.username && (
            <p className="text-muted-foreground">@{status.profile.username}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Режим:{" "}
            {status.mode === "webhook" ? "Webhook (HTTPS)" : "Polling (без домена)"}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Клиенты пишут боту в Telegram — диалоги появляются во «Входящих».
            Ответы уходят от имени бота.
          </p>
        </div>
      ) : status?.configured ? (
        <p className="text-sm text-destructive">
          Токен задан, но бот не отвечает:{" "}
          {status.error ?? "проверьте TELEGRAM_BOT_TOKEN"}
        </p>
      ) : (
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            Откройте{" "}
            <a
              className="text-primary underline"
              href="https://t.me/BotFather"
              target="_blank"
              rel="noreferrer"
            >
              @BotFather
            </a>{" "}
            в Telegram
          </li>
          <li>
            Отправьте <code className="text-xs">/newbot</code> и создайте бота
            для БАРСМЕД (например «БАРСМЕД Support»)
          </li>
          <li>Скопируйте токен вида <code className="text-xs">123456:ABC...</code></li>
          <li>
            На сервере в{" "}
            <code className="text-xs">/opt/hubdesk/.env.local</code> добавьте:
            <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-xs">
              TELEGRAM_MODE=bot{"\n"}
              TELEGRAM_BOT_TOKEN=ваш_токен_от_BotFather
            </pre>
          </li>
          <li>
            Перезапустите:{" "}
            <code className="text-xs">docker compose restart</code>
          </li>
          <li>Напишите боту любое сообщение — диалог появится во «Входящих»</li>
        </ol>
      )}

      {status?.webhooks && status.webhooks.length > 0 && isBotMode && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
          <p className="font-medium text-amber-900 dark:text-amber-100">
            Бот привязан к webhook — polling не работает
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
            onClick={handleClearWebhook}
          >
            Отключить webhook (включить polling)
          </Button>
        </div>
      )}

      {status?.webhookBaseUrl && isBotMode ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Webhook URL: {status.webhookBaseUrl}/api/webhooks/telegram
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
            ) : (
              "Зарегистрировать webhook"
            )}
          </Button>
        </div>
      ) : isBotMode ? (
        <p className="text-xs text-muted-foreground">
          Без HTTPS сообщения опрашиваются каждые 5 сек — как MAX. Для
          production укажите{" "}
          <code>WEBHOOK_BASE_URL=https://ваш-домен.ru</code>.
        </p>
      ) : null}

      {message && <p className="text-sm text-green-700">{message}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button variant="ghost" size="sm" onClick={loadStatus}>
        Обновить статус
      </Button>
    </div>
  );
}
