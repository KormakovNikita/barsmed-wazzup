"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TelegramProfile {
  id: string;
  name: string;
  username?: string;
  phone?: string;
}

export function TelegramConnectForm() {
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<TelegramProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [proxy, setProxy] = useState("");
  const [credentialsSaved, setCredentialsSaved] = useState(false);
  const [loadingCredentials, setLoadingCredentials] = useState(true);
  const [qrAuthId, setQrAuthId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<string | null>(null);
  const [passwordHint, setPasswordHint] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadProfile = useCallback(() => {
    fetch("/api/integrations/telegram/auth/status")
      .then((res) => res.json())
      .then((data) => {
        if (data.connected && data.profile) {
          setProfile(data.profile);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/integrations/telegram/credentials")
      .then((res) => res.json())
      .then((data) => {
        if (data.apiId) setApiId(String(data.apiId));
        if (data.proxyPreview) setProxy(data.proxyPreview);
        setCredentialsSaved(Boolean(data.configured));
      })
      .catch(() => {})
      .finally(() => setLoadingCredentials(false));

    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleSaveCredentials() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/telegram/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiId, apiHash, proxy: proxy || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      setCredentialsSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function pollQrStatus(authId: string) {
    const res = await fetch(
      `/api/integrations/telegram/auth/qr?authId=${encodeURIComponent(authId)}`,
    );
    const data = await res.json();

    if (data.status === "expired") {
      setQrStatus("expired");
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    setQrStatus(data.status);
    if (data.qrDataUrl) setQrDataUrl(data.qrDataUrl);
    if (data.passwordHint) setPasswordHint(data.passwordHint);
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
    setPasswordHint(null);
    setPassword("");

    try {
      const res = await fetch("/api/integrations/telegram/auth/qr", {
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

  async function handleSubmitPassword() {
    if (!qrAuthId || !password.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/telegram/auth/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authId: qrAuthId, password: password.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
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
      await fetch("/api/integrations/telegram/auth/status", {
        method: "DELETE",
      });
      setProfile(null);
      setQrAuthId(null);
      setQrDataUrl(null);
    } catch {
      setError("Не удалось отключить аккаунт");
    } finally {
      setLoading(false);
    }
  }

  if (profile) {
    return (
      <div className="space-y-4 rounded-lg border bg-card p-4">
        <div>
          <p className="font-medium">Telegram подключён</p>
          <p className="text-sm text-muted-foreground">
            {profile.name}
            {profile.username ? ` (@${profile.username})` : ""}
            {profile.phone ? ` · ${profile.phone}` : ""}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Клиенты пишут в этот аккаунт компании — сообщения приходят во
          «Входящие», ответы уходят от его имени.
        </p>
        <Button variant="outline" onClick={handleDisconnect} disabled={loading}>
          Отключить аккаунт
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
        <p className="font-medium">Почему в Wazzup не нужен был API?</p>
        <p className="mt-1 text-xs leading-relaxed">
          Wazzup — платный посредник: у них уже зарегистрировано приложение в
          Telegram, вы только сканировали QR. БАРСМЕД подключается напрямую —
          нужны API-ключи приложения <strong>один раз</strong> (как «паспорт»
          программы), дальше только QR.
        </p>
      </div>

      {!loadingCredentials && !credentialsSaved && (
        <div className="space-y-3 rounded-md border bg-muted/40 p-3">
          <p className="text-sm font-medium">
            Шаг 1 — API ID и Hash (один раз)
          </p>
          <p className="text-xs text-muted-foreground">
            Получите на{" "}
            <a
              href="https://my.telegram.org"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              my.telegram.org
            </a>{" "}
            через VPN (не российский IP) → API development tools → Create
            application. Если сайт выдаёт Error — другой VPN, мобильный интернет
            или попросите знакомого за рубежом создать и прислать два числа.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="apiId">API ID</Label>
              <Input
                id="apiId"
                placeholder="12345678"
                value={apiId}
                onChange={(e) => setApiId(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apiHash">API Hash</Label>
              <Input
                id="apiHash"
                placeholder="abcdef..."
                value={apiHash}
                onChange={(e) => setApiHash(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="proxy">Прокси для сервера (SOCKS5 или MTProxy)</Label>
            <Input
              id="proxy"
              placeholder="https://t.me/proxy?server=...&port=443&secret=..."
              value={proxy}
              onChange={(e) => setProxy(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              MTProxy: вставьте ссылку из t.me/proxy. SOCKS5: socks5://user:pass@host:port
            </p>
          </div>
          <Button
            onClick={handleSaveCredentials}
            disabled={loading || !apiId.trim() || !apiHash.trim()}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Сохранить ключи
          </Button>
        </div>
      )}

      {credentialsSaved && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Шаг 2 — отсканируйте QR</p>
          <p className="text-xs text-muted-foreground">
            На телефоне: Telegram → Настройки → Устройства → Подключить
            устройство. Сканируйте код рабочего аккаунта компании.
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
                  alt="QR для входа в Telegram"
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
                {qrStatus === "needs_password"
                  ? "Введите пароль 2FA после сканирования"
                  : "QR обновляется автоматически — не закрывайте страницу"}
              </p>
              {qrStatus === "expired" && (
                <Button variant="outline" size="sm" onClick={handleStartQr}>
                  Получить новый QR
                </Button>
              )}
            </div>
          )}

          {qrStatus === "needs_password" && (
            <div className="space-y-2">
              {passwordHint && (
                <p className="text-xs text-muted-foreground">
                  Подсказка: {passwordHint}
                </p>
              )}
              <Input
                type="password"
                placeholder="Пароль 2FA"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button
                onClick={handleSubmitPassword}
                disabled={loading || !password.trim()}
              >
                Подтвердить
              </Button>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
