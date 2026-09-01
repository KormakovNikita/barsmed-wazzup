"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MaxProxyStatus {
  enabled: boolean;
  configured: boolean;
  connected: boolean;
  profile: { id?: number; name?: string } | null;
  error?: string | null;
}

export function MaxProxyPanel() {
  const [status, setStatus] = useState<MaxProxyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [authId, setAuthId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/max-proxy/status");
      const data = await res.json();
      setStatus(data);
    } catch {
      setError("Не удалось загрузить статус MAX Proxy");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!authId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/integrations/max-proxy/auth/qr?authId=${encodeURIComponent(authId)}`,
        );
        const data = await res.json();
        setQrStatus(data.status ?? null);
        if (data.qrDataUrl) setQrDataUrl(data.qrDataUrl);
        if (data.error) setError(data.error);
        if (data.status === "done") {
          setAuthId(null);
          setQrDataUrl(null);
          await loadStatus();
        }
        if (data.status === "expired" || data.status === "error") {
          setAuthId(null);
        }
      } catch {
        setError("Ошибка опроса QR");
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [authId, loadStatus]);

  async function handleStartQr() {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/max-proxy/auth/qr", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка QR");
      setAuthId(data.authId);
      setQrStatus("pending");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDisconnect() {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/max-proxy/status", {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Не удалось отключить");
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
        Проверяем MAX Proxy…
      </div>
    );
  }

  if (!status?.enabled) return null;

  return (
    <div className="space-y-4 rounded-lg border border-blue-300 bg-blue-50/50 p-4 dark:border-blue-800 dark:bg-blue-950/20">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold">MAX Proxy — голосовые сообщения</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Собственный прокси-сервер HubDesk на базе протокола MAX. Получает
            нативные голосовые (удержание кнопки записи), которые Bot API не
            передаёт ботам. Работает вместе с MAX Bot — текст и фото идут через
            бота, голосовые через прокси.
          </p>
        </div>
        {status.connected ? (
          <CheckCircle2 className="size-6 shrink-0 text-green-600" />
        ) : status.configured ? (
          <XCircle className="size-6 shrink-0 text-destructive" />
        ) : null}
      </div>

      {status.connected && status.profile ? (
        <div className="rounded-md border bg-background p-3 text-sm">
          <p className="font-medium">{status.profile.name}</p>
          <p className="text-xs text-muted-foreground">
            Прокси активен — голосовые из диалогов с ботом подтягиваются
            автоматически
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={actionLoading}
            onClick={handleDisconnect}
          >
            Отключить прокси
          </Button>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>
              Войдите аккаунтом MAX, привязанным к{" "}
              <strong>business.max.ru</strong> (организация, которой принадлежит
              бот)
            </li>
            <li>
              На телефоне: Профиль → Устройства → Подключить устройство →
              отсканируйте QR
            </li>
            <li>
              Прокси будет опрашивать известные диалоги бота и скачивать
              голосовые
            </li>
          </ol>
          <Button
            size="sm"
            disabled={actionLoading || Boolean(authId)}
            onClick={handleStartQr}
          >
            {actionLoading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Генерация QR…
              </>
            ) : (
              "Подключить MAX Proxy (QR)"
            )}
          </Button>
        </div>
      )}

      {qrDataUrl && qrStatus === "pending" && (
        <div className="flex flex-col items-center gap-2 rounded-md border bg-background p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="QR для MAX Proxy" className="size-56" />
          <p className="text-xs text-muted-foreground">
            Отсканируйте QR в приложении MAX
          </p>
        </div>
      )}

      {qrStatus === "scanned" && (
        <p className="text-sm text-green-700">QR отсканирован, завершаем вход…</p>
      )}

      {status.error && (
        <p className="text-sm text-destructive">{status.error}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button variant="ghost" size="sm" onClick={loadStatus}>
        Обновить статус
      </Button>
    </div>
  );
}
