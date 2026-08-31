"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MaxProfile {
  userId: number;
  name: string;
  username?: string;
}

interface MaxStatus {
  configured: boolean;
  connected: boolean;
  mode: "webhook" | "polling";
  profile: MaxProfile | null;
  error?: string | null;
  webhookBaseUrl?: string | null;
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
        mode: data.max?.mode ?? "polling",
        profile: data.max?.profile ?? null,
        error: data.max?.error ?? null,
        webhookBaseUrl: data.webhookBaseUrl ?? null,
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

      if (data.results?.max?.ok) {
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
        <div className="rounded-md border bg-background p-3 text-sm">
          <p className="font-medium">{status.profile.name}</p>
          {status.profile.username && (
            <p className="text-muted-foreground">@{status.profile.username}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Режим: {status.mode === "webhook" ? "Webhook" : "Polling (без HTTPS)"}
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

      {status?.webhookBaseUrl ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Webhook URL: {status.webhookBaseUrl}/api/webhooks/max
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
