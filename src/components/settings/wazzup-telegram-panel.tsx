"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WazzupTelegramStatus {
  configured: boolean;
  connected: boolean;
  mode: string;
  profile: { id: string; name: string; username?: string } | null;
  error?: string | null;
  webhookBaseUrl?: string | null;
  webhooks?: { url: string }[];
  wazzupChannelId?: string | null;
}

export function WazzupTelegramPanel() {
  const [status, setStatus] = useState<WazzupTelegramStatus | null>(null);
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
        mode: data.telegram?.mode ?? "wazzup",
        profile: data.telegram?.profile ?? null,
        error: data.telegram?.error ?? null,
        webhookBaseUrl: data.webhookBaseUrl ?? null,
        webhooks: data.telegram?.webhooks ?? [],
        wazzupChannelId: data.telegram?.wazzupChannelId ?? null,
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

  async function handleRegisterWebhook() {
    setActionLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register-wazzup-webhook" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      setMessage("Webhook Wazzup зарегистрирован — сообщения пойдут в HubDesk");
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
        Проверяем Telegram через Wazzup…
      </div>
    );
  }

  const isWazzupMode = status?.mode === "wazzup";

  return (
    <div className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">
            Telegram — аккаунт компании
          </h2>
          <p className="text-sm text-muted-foreground">
            Через Wazzup: клиенты пишут в ваш рабочий Telegram, не в бота.
            my.telegram.org не нужен.
          </p>
        </div>
        {isWazzupMode && status?.connected ? (
          <CheckCircle2 className="size-6 shrink-0 text-green-600" />
        ) : isWazzupMode && status?.configured ? (
          <XCircle className="size-6 shrink-0 text-destructive" />
        ) : null}
      </div>

      {!isWazzupMode && (
        <p className="text-sm text-amber-800 dark:text-amber-200">
          Сейчас включён другой режим Telegram (
          <code className="text-xs">{status?.mode}</code>). Для аккаунта
          компании задайте{" "}
          <code className="text-xs">TELEGRAM_MODE=wazzup</code> в{" "}
          <code className="text-xs">.env.local</code>.
        </p>
      )}

      {isWazzupMode && status?.connected && status.profile ? (
        <div className="rounded-md border bg-background p-3 text-sm">
          <p className="font-medium">{status.profile.name}</p>
          <p className="text-xs text-muted-foreground">
            Канал Wazzup: {status.wazzupChannelId}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Входящие и исходящие сообщения идут через ваш Telegram-аккаунт,
            подключённый в Wazzup.
          </p>
        </div>
      ) : isWazzupMode && status?.configured ? (
        <p className="text-sm text-destructive">
          {status.error ??
            "Wazzup API ключ есть, но Telegram-канал не найден"}
        </p>
      ) : isWazzupMode ? (
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            В личном кабинете{" "}
            <a
              className="text-primary underline"
              href="https://wazzup24.com"
              target="_blank"
              rel="noreferrer"
            >
              Wazzup
            </a>{" "}
            подключите <strong>личный Telegram</strong> (не бота) — раздел
            «Каналы»
          </li>
          <li>
            Скопируйте API-ключ: Настройки → Интеграция → API
          </li>
          <li>
            На сервере в <code className="text-xs">/opt/hubdesk/.env.local</code>:
            <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-xs">
              TELEGRAM_MODE=wazzup{"\n"}
              WAZZUP_API_KEY=ваш_ключ
            </pre>
          </li>
          <li>
            Настройте HTTPS-домен и{" "}
            <code className="text-xs">WEBHOOK_BASE_URL=https://lk.mrtkt.ru</code>
          </li>
          <li>
            Перезапустите:{" "}
            <code className="text-xs">docker compose restart</code>
          </li>
          <li>Нажмите «Зарегистрировать webhook» ниже</li>
        </ol>
      ) : null}

      {isWazzupMode && status?.webhookBaseUrl ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Webhook URL: {status.webhookBaseUrl}/api/webhooks/wazzup
          </p>
          <Button
            variant="default"
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
              "Зарегистрировать webhook Wazzup"
            )}
          </Button>
        </div>
      ) : isWazzupMode ? (
        <p className="text-xs text-muted-foreground">
          Wazzup отправляет сообщения только на <strong>HTTPS</strong> webhook.
          Без домена сообщения не придут — настройте nginx + certbot на{" "}
          <code>lk.mrtkt.ru</code> или другой домен.
        </p>
      ) : null}

      {status?.webhooks && status.webhooks.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Текущий webhook Wazzup: {status.webhooks[0]?.url}
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
