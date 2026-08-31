"use client";

import { useEffect, useState } from "react";
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
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [authId, setAuthId] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [isCodeViaApp, setIsCodeViaApp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<TelegramProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"phone" | "code" | "password">("phone");
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [credentialsSaved, setCredentialsSaved] = useState(false);
  const [loadingCredentials, setLoadingCredentials] = useState(true);

  useEffect(() => {
    fetch("/api/integrations/telegram/credentials")
      .then((res) => res.json())
      .then((data) => {
        if (data.apiId) setApiId(String(data.apiId));
        setCredentialsSaved(Boolean(data.configured));
      })
      .catch(() => {})
      .finally(() => setLoadingCredentials(false));

    fetch("/api/integrations/telegram/auth/status")
      .then((res) => res.json())
      .then((data) => {
        if (data.connected && data.profile) {
          setProfile(data.profile);
        }
      })
      .catch(() => {});
  }, []);

  async function handleSaveCredentials() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/telegram/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiId, apiHash }),
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

  async function handleSendCode() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/telegram/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");

      setAuthId(data.authId);
      setIsCodeViaApp(data.isCodeViaApp);
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn() {
    if (!authId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/telegram/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authId,
          code,
          password: needsPassword ? password : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");

      if (data.needsPassword) {
        setNeedsPassword(true);
        setStep("password");
        return;
      }

      setProfile(data.profile);
      setStep("phone");
      setAuthId(null);
      setCode("");
      setPassword("");
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
      setStep("phone");
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
          Сообщения клиентам отправляются от имени этого аккаунта компании, а не
          через бота.
        </p>
        <Button variant="outline" onClick={handleDisconnect} disabled={loading}>
          Отключить аккаунт
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div>
        <p className="font-medium">Подключить Telegram аккаунт компании</p>
        <p className="text-sm text-muted-foreground">
          Нужны <code className="text-xs">TELEGRAM_API_ID</code> и{" "}
          <code className="text-xs">TELEGRAM_API_HASH</code> в{" "}
          <code className="text-xs">.env.local</code> и{" "}
          <code className="text-xs">TELEGRAM_MODE=user</code>.
        </p>
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-medium">my.telegram.org выдаёт Error?</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            <li>Попробуйте через VPN (не российский IP)</li>
            <li>Откройте с телефона через мобильный интернет</li>
            <li>Другой браузер или режим инкогнито</li>
            <li>
              Попросите коллегу за рубежом создать приложение и прислать API ID /
              Hash
            </li>
            <li>
              Или используйте{" "}
              <strong>режим бота</strong> выше — он работает без my.telegram.org
            </li>
          </ul>
        </div>
      </div>

      {!loadingCredentials && !credentialsSaved && (
        <div className="space-y-3 rounded-md border bg-muted/40 p-3">
          <p className="text-sm font-medium">Шаг 1: API ID и Hash</p>
          <p className="text-xs text-muted-foreground">
            Получите на my.telegram.org через VPN (см. подсказку выше) или
            попросите коллегу за рубежом.
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
          <Button
            onClick={handleSaveCredentials}
            disabled={loading || !apiId.trim() || !apiHash.trim()}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Сохранить API ключи
          </Button>
        </div>
      )}

      {credentialsSaved && step === "phone" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="phone">Номер телефона</Label>
            <Input
              id="phone"
              placeholder="+7 900 123-45-67"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <Button onClick={handleSendCode} disabled={loading || !phone.trim()}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Получить код
          </Button>
        </div>
      )}

      {step === "code" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Код отправлен {isCodeViaApp ? "в приложение Telegram" : "по SMS"}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="code">Код подтверждения</Label>
            <Input
              id="code"
              placeholder="12345"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <Button onClick={handleSignIn} disabled={loading || !code.trim()}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Войти
          </Button>
        </div>
      )}

      {step === "password" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            На аккаунте включена двухфакторная аутентификация
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="password">Пароль 2FA</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button
            onClick={handleSignIn}
            disabled={loading || !password.trim()}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Подтвердить
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
