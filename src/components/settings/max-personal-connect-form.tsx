"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MaxPersonalProfile {
  id?: number;
  name?: string;
}

export function MaxPersonalConnectForm() {
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<MaxPersonalProfile | null>(null);
  const [connected, setConnected] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrAuthId, setQrAuthId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStatus = useCallback(() => {
    fetch("/api/integrations/max-personal/status")
      .then((res) => res.json())
      .then((data) => {
        setEnabled(data.enabled === true);
        setConnected(Boolean(data.connected));
        if (data.connected && data.profile) {
          setProfile(data.profile);
          setError(null);
        } else {
          setProfile(null);
          if (data.error) setError(data.error);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadStatus]);

  async function pollQrStatus(authId: string) {
    const res = await fetch(
      `/api/integrations/max-personal/auth/qr?authId=${encodeURIComponent(authId)}`,
    );
    const data = await res.json();

    if (data.status === "expired") {
      setQrStatus("expired");
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    setQrStatus(data.status);
    if (data.qrDataUrl) setQrDataUrl(data.qrDataUrl);
    if (data.error) setError(data.error);

    if (data.status === "done") {
      if (pollRef.current) clearInterval(pollRef.current);
      setQrAuthId(null);
      setQrDataUrl(null);
      loadStatus();
    }
  }

  async function handleStartQr() {
    setLoading(true);
    setError(null);
    setQrDataUrl(null);

    try {
      const res = await fetch("/api/integrations/max-personal/auth/qr", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");

      setQrAuthId(data.authId);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        void pollQrStatus(data.authId);
      }, 2000);
      await pollQrStatus(data.authId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/max-personal/status", {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Ошибка отключения");
      }
      setProfile(null);
      setConnected(false);
      setQrAuthId(null);
      setQrDataUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  if (!enabled) {
    return (
      <div className="space-y-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <p>
          Канал отключён на сервере. Чтобы включить, задайте{" "}
          <code className="text-xs">MAX_PERSONAL_ENABLED=true</code> и
          перезапустите приложение.
        </p>
        <p className="text-xs">
          Используйте MAX Personal только если понимаете риски: неофициальный API
          может привести к блокировке аккаунта MAX.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        <p className="font-medium">Важно</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>Это личный аккаунт MAX, не бот Wazzup</li>
          <li>MAX может ограничить аккаунт при автоматической отправке</li>
          <li>
            Не нажимайте «Завершить все сессии» в MAX, пока БАРСМЕД подключён
          </li>
          <li>
            При блокировке используйте канал{" "}
            <strong>MAX (бот Wazzup)</strong> для переписки
          </li>
        </ul>
      </div>

      {connected && profile ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-md bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-950/30">
            <div>
              <p className="font-medium text-emerald-800 dark:text-emerald-200">
                Подключено: {profile.name}
              </p>
              {profile.id != null && (
                <p className="text-xs text-muted-foreground">ID: {profile.id}</p>
              )}
            </div>
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Отключить аккаунт
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Подключите личный аккаунт MAX для исходящих сообщений клиентам.
            Отсканируйте QR-код в приложении MAX на телефоне.
          </p>

          {qrDataUrl ? (
            <div className="flex flex-col items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="QR-код для входа в MAX"
                className="rounded-lg border"
                width={280}
                height={280}
              />
              <p className="text-xs text-muted-foreground">
                {qrStatus === "scanned"
                  ? "Подтвердите вход на телефоне…"
                  : "Откройте MAX → Настройки → Устройства → Войти по QR"}
              </p>
            </div>
          ) : (
            <Button onClick={handleStartQr} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Показать QR-код
            </Button>
          )}

          {qrStatus === "expired" && (
            <p className="text-sm text-destructive">
              QR-код истёк. Нажмите «Показать QR-код» снова.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
