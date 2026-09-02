"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface VkCredentials {
  configured: boolean;
  groupId: string;
  hasToken: boolean;
  tokenPreview: string | null;
  hasConfirmation: boolean;
  hasSecret: boolean;
  source: "settings" | "env" | null;
}

interface VkStatus {
  configured: boolean;
  connected: boolean;
  mode: "long_poll" | "callback";
  profile: { id: number; name: string; screenName?: string } | null;
  error?: string | null;
  webhookUrl?: string | null;
}

export function VkConnectPanel() {
  const [credentials, setCredentials] = useState<VkCredentials | null>(null);
  const [status, setStatus] = useState<VkStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [groupId, setGroupId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [callbackConfirmation, setCallbackConfirmation] = useState("");
  const [callbackSecret, setCallbackSecret] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [credRes, statusRes] = await Promise.all([
        fetch("/api/integrations/vk/credentials"),
        fetch("/api/integrations/status"),
      ]);
      const credData = (await credRes.json()) as VkCredentials;
      const statusData = await statusRes.json();

      setCredentials(credData);
      setStatus(statusData.vk ?? null);
      if (credData.groupId && !groupId) {
        setGroupId(credData.groupId);
      }
    } catch {
      setError("Не удалось загрузить настройки VK");
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/integrations/vk/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId,
          accessToken: accessToken || undefined,
          callbackConfirmation: callbackConfirmation || undefined,
          callbackSecret: callbackSecret || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка сохранения");

      setAccessToken("");
      setMessage(
        "Настройки VK сохранены. Сообщения начнут поступать в inbox в течение нескольких секунд.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (!confirm("Удалить сохранённые ключи VK из базы?")) return;
    setSaving(true);
    setError(null);
    try {
      await fetch("/api/integrations/vk/credentials", { method: "DELETE" });
      setMessage("Ключи VK удалены из настроек");
      setGroupId("");
      setAccessToken("");
      await load();
    } catch {
      setError("Не удалось удалить ключи");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Проверяем VK…
      </div>
    );
  }

  const connected = status?.connected ?? false;

  return (
    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            {connected ? (
              <CheckCircle2 className="size-5 text-emerald-600" />
            ) : credentials?.configured ? (
              <XCircle className="size-5 text-amber-600" />
            ) : (
              <XCircle className="size-5 text-muted-foreground" />
            )}
            <span className="font-medium">
              {connected
                ? status?.profile?.name ?? "VK подключён"
                : credentials?.configured
                  ? "VK: ошибка подключения"
                  : "VK не настроен"}
            </span>
          </div>
          {status?.profile?.screenName && (
            <p className="mt-1 text-sm text-muted-foreground">
              vk.com/{status.profile.screenName}
            </p>
          )}
          {status?.error && (
            <p className="mt-1 text-sm text-destructive">{status.error}</p>
          )}
          <p className="mt-2 text-sm text-muted-foreground">
            Режим:{" "}
            {status?.mode === "callback"
              ? "Callback API (webhook, нужен HTTPS)"
              : "Long Poll (работает по HTTP/IP)"}
          </p>
          {status?.webhookUrl && (
            <p className="mt-1 break-all text-xs text-muted-foreground">
              Webhook: {status.webhookUrl}
            </p>
          )}
          {credentials?.tokenPreview && (
            <p className="mt-1 text-xs text-muted-foreground">
              Токен: {credentials.tokenPreview}
              {credentials.source === "env" ? " (из .env)" : ""}
            </p>
          )}
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="vk-group-id">ID сообщества</Label>
          <Input
            id="vk-group-id"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            placeholder="123456789"
            inputMode="numeric"
          />
          <p className="text-xs text-muted-foreground">
            Число из адреса vk.com/club<strong>123456789</strong> или
            vk.com/public<strong>123456789</strong> (без минуса).
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="vk-access-token">Ключ доступа сообщества</Label>
          <Input
            id="vk-access-token"
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder={
              credentials?.hasToken
                ? "Оставьте пустым, чтобы не менять"
                : "vk1.a...."
            }
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Управление сообществом → Работа с API → Ключи доступа → Создать ключ
            с правом «Сообщения сообщества».
          </p>
        </div>

        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Callback API (только если есть HTTPS-домен)
          </summary>
          <div className="mt-3 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="vk-confirmation">Строка подтверждения</Label>
              <Input
                id="vk-confirmation"
                value={callbackConfirmation}
                onChange={(e) => setCallbackConfirmation(e.target.value)}
                placeholder="abc123"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vk-secret">Секретный ключ</Label>
              <Input
                id="vk-secret"
                value={callbackSecret}
                onChange={(e) => setCallbackSecret(e.target.value)}
                placeholder="optional"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              В настройках Callback API укажите URL{" "}
              {status?.webhookUrl ?? "https://ваш-домен/api/webhooks/vk"} и
              включите событие «Входящее сообщение».
            </p>
          </div>
        </details>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving || !groupId || (!accessToken && !credentials?.hasToken)}>
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Сохраняем…
              </>
            ) : (
              "Сохранить"
            )}
          </Button>
          {credentials?.source === "settings" && (
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={handleClear}
            >
              Удалить из базы
            </Button>
          )}
        </div>
      </form>

      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
