"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface WhatsAppProfile {
  id?: string;
  name?: string;
  phone?: string;
}

export function WhatsAppConnectForm() {
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<WhatsAppProfile | null>(null);
  const [connected, setConnected] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [proxyConfigured, setProxyConfigured] = useState(false);
  const [usesTelegramProxy, setUsesTelegramProxy] = useState(false);
  const [telegramIsMtProxy, setTelegramIsMtProxy] = useState(false);
  const [proxyHint, setProxyHint] = useState<string | null>(null);
  const [proxy, setProxy] = useState("");
  const [proxySaved, setProxySaved] = useState(false);
  const [loadingCredentials, setLoadingCredentials] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrAuthId, setQrAuthId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStatus = useCallback(() => {
    fetch("/api/integrations/whatsapp/status")
      .then((res) => res.json())
      .then((data) => {
        setEnabled(data.enabled !== false);
        setConnected(Boolean(data.connected));
        setProxyConfigured(Boolean(data.proxyConfigured));
        setProxyHint(data.proxyHint ?? null);
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
    fetch("/api/integrations/whatsapp/credentials")
      .then((res) => res.json())
      .then((data) => {
        if (data.proxyPreview) setProxy(data.proxyPreview);
        setProxySaved(Boolean(data.configured && !data.usesTelegramProxy));
        setUsesTelegramProxy(Boolean(data.usesTelegramProxy));
        setTelegramIsMtProxy(Boolean(data.telegramIsMtProxy));
        setProxyConfigured(Boolean(data.configured));
      })
      .catch(() => {})
      .finally(() => setLoadingCredentials(false));

    loadStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadStatus]);

  async function handleSaveProxy() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/whatsapp/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxy: proxy || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      setProxySaved(Boolean(proxy.trim()));
      loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function pollQrStatus(authId: string) {
    const res = await fetch(
      `/api/integrations/whatsapp/auth/qr?authId=${encodeURIComponent(authId)}`,
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
      const res = await fetch("/api/integrations/whatsapp/auth/qr", {
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
      const res = await fetch("/api/integrations/whatsapp/status", {
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
          <code className="text-xs">WHATSAPP_ENABLED=true</code> (или уберите{" "}
          <code className="text-xs">WHATSAPP_ENABLED=false</code>) и перезапустите
          приложение.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        <p className="font-medium">WhatsApp в России — только через VPN/прокси</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            Если для Telegram уже задан <strong>SOCKS5</strong> — WhatsApp
            использует его автоматически, отдельный прокси не нужен
          </li>
          <li>
            <strong>MTProxy</strong> (ссылка t.me/proxy) для Telegram не
            подходит — WhatsApp понимает только SOCKS5 или HTTP
          </li>
          <li>
            Подключение напрямую через WhatsApp Web, без Wazzup
          </li>
          <li>
            Используйте отдельный номер WhatsApp Business — не личный основной
          </li>
        </ul>
      </div>

      <div className="space-y-2">
        <Label htmlFor="wa-proxy">Прокси WhatsApp (опционально)</Label>
        <Input
          id="wa-proxy"
          placeholder="socks5://user:pass@host:1080 — или оставьте пустым"
          value={proxy}
          onChange={(e) => setProxy(e.target.value)}
          disabled={loadingCredentials}
        />
        <p className="text-xs text-muted-foreground">
          Оставьте пустым, если SOCKS5 уже задан в блоке Telegram выше. Отдельный
          прокси нужен только если для WhatsApp другой VPN.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSaveProxy}
          disabled={loading || loadingCredentials}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Сохранить прокси
        </Button>
        {proxySaved && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Отдельный прокси WhatsApp сохранён
          </p>
        )}
        {usesTelegramProxy && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Используется SOCKS-прокси из настроек Telegram
          </p>
        )}
        {telegramIsMtProxy && (
          <p className="text-xs text-destructive">
            У Telegram MTProxy (t.me/proxy) — для WhatsApp нужен SOCKS5 или HTTP
          </p>
        )}
      </div>

      {connected && profile ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-md bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-950/30">
            <div>
              <p className="font-medium text-emerald-800 dark:text-emerald-200">
                Подключено: {profile.name}
              </p>
              {profile.phone && (
                <p className="text-xs text-muted-foreground">
                  {profile.phone}
                </p>
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
            Отключить WhatsApp
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {proxyConfigured
              ? "Отсканируйте QR-код в WhatsApp Business: Настройки → Связанные устройства → Привязка устройства."
              : telegramIsMtProxy
                ? "Задайте SOCKS5-прокси (в Telegram или здесь) — MTProxy не подходит для WhatsApp."
                : "Задайте SOCKS5-прокси в Telegram или здесь, затем подключите аккаунт по QR."}
          </p>
          {proxyHint && !connected && (
            <p className="text-xs text-muted-foreground">{proxyHint}</p>
          )}

          {qrDataUrl ? (
            <div className="flex flex-col items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="QR-код для входа в WhatsApp"
                className="rounded-lg border"
                width={280}
                height={280}
              />
              <p className="text-xs text-muted-foreground">
                {qrStatus === "scanned"
                  ? "Подтвердите вход на телефоне…"
                  : "WhatsApp → Связанные устройства → Привязка устройства"}
              </p>
            </div>
          ) : (
            <Button
              onClick={handleStartQr}
              disabled={loading || !proxyConfigured}
            >
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
