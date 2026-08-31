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

  useEffect(() => {
    fetch("/api/integrations/telegram/auth/status")
      .then((res) => res.json())
      .then((data) => {
        if (data.connected && data.profile) {
          setProfile(data.profile);
        }
      })
      .catch(() => {});
  }, []);

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
          Используйте рабочий номер телефона. Нужны TELEGRAM_API_ID и
          TELEGRAM_API_HASH из{" "}
          <a
            href="https://my.telegram.org"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            my.telegram.org
          </a>
          .
        </p>
      </div>

      {step === "phone" && (
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
