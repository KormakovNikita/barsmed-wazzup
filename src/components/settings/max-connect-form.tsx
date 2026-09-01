"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MaxProfile {
  userId: number;
  name: string;
  username?: string;
  phone?: string;
}

export function MaxConnectForm() {
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<MaxProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qrAuthId, setQrAuthId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadProfile = useCallback(() => {
    fetch("/api/integrations/max/auth/status")
      .then((res) => res.json())
      .then((data) => {
        if (data.connected && data.profile) {
          setProfile(data.profile);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function pollQrStatus(authId: string) {
    const res = await fetch(
      `/api/integrations/max/auth/qr?authId=${encodeURIComponent(authId)}`,
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

    if (data.status === "complete") {
      if (pollRef.current) clearInterval(pollRef.current);
      setQrAuthId(null);
      loadProfile();
    }
  }

  async function handleStartQr() {
    setLoading(true);
    setError(null);
    setQrDataUrl(null);

    try {
      const res = await fetch("/api/integrations/max/auth/qr", {
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
      await fetch("/api/integrations/max/auth/status", { method: "DELETE" });
      setProfile(null);
      setQrAuthId(null);
      setQrDataUrl(null);
    } catch {
      setError("Не удалось отключить аккаунт MAX");
    } finally {
      setLoading(false);
    }
  }

  if (profile) {
    return (
      <div className="space-y-4 rounded-lg border bg-card p-4">
        <div>
          <p className="font-medium">MAX подключён</p>
          <p className="text-sm text-muted-foreground">
            {profile.name}
            {profile.username ? ` (@${profile.username})` : ""}
            {profile.phone ? ` · ${profile.phone}` : ""}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Клиенты пишут в аккаунт компании в MAX — приходят текст, фото, файлы и{" "}
          <strong>голосовые сообщения</strong>. Ответы уходят от имени этого
          аккаунта.
        </p>
        <p className="text-xs text-muted-foreground">
          После подключения HubDesk автоматически переключится на аккаунт
          компании (если не задан <code>MAX_MODE=bot</code>).
        </p>
        <Button variant="outline" onClick={handleDisconnect} disabled={loading}>
          Отключить аккаунт
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
        <p className="font-medium">Голосовые без Wazzup</p>
        <p className="mt-1 text-xs leading-relaxed">
          Bot API MAX не отдаёт нативные голосовые (удержание кнопки записи).
          Через аккаунт компании — как в Wazzup на живом MAX — голосовые
          скачиваются и отображаются во «Входящих».
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">Подключение по QR</p>
        <p className="text-xs text-muted-foreground">
          На телефоне: MAX → Профиль → Устройства → Подключить устройство.
          Сканируйте код рабочего аккаунта компании.
        </p>

        {!qrAuthId ? (
          <Button onClick={handleStartQr} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Показать QR-код
          </Button>
        ) : (
          <div className="flex flex-col items-center gap-3">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt="QR для входа в MAX"
                className="rounded-lg border bg-white p-2"
                width={280}
                height={280}
              />
            ) : (
              <div className="flex h-[280px] w-[280px] items-center justify-center rounded-lg border bg-muted">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {qrStatus === "complete"
                ? "Аккаунт подключён"
                : "Ожидаем сканирование QR…"}
            </p>
            {qrStatus === "expired" && (
              <Button variant="outline" size="sm" onClick={handleStartQr}>
                Получить новый QR
              </Button>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
