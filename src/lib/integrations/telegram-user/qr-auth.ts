import { TelegramClient } from "teleproto";
import { createAuthClient, getApiCredentials } from "./auth-state";
import { writeTelegramSession } from "./session";

export interface PendingQrAuth {
  id: string;
  client: TelegramClient;
  qrUrl: string | null;
  status: "waiting_scan" | "needs_password" | "complete" | "error" | "expired";
  error?: string;
  passwordHint?: string;
  createdAt: number;
  loginPromise?: Promise<void>;
  resolvePassword?: (password: string) => void;
}

const pendingQrAuths = new Map<string, PendingQrAuth>();
const QR_TTL_MS = 5 * 60 * 1000;

function cleanupExpiredQrAuths(): void {
  const now = Date.now();
  for (const [id, auth] of pendingQrAuths) {
    if (now - auth.createdAt > QR_TTL_MS) {
      pendingQrAuths.delete(id);
      void auth.client.disconnect();
    }
  }
}

export function getPendingQrAuth(id: string): PendingQrAuth | undefined {
  cleanupExpiredQrAuths();
  return pendingQrAuths.get(id);
}

export function cancelPendingQrAuth(id: string): void {
  const auth = pendingQrAuths.get(id);
  if (auth) {
    pendingQrAuths.delete(id);
    void auth.client.disconnect();
  }
}

export async function startTelegramQrAuth(): Promise<{ authId: string }> {
  const creds = getApiCredentials();
  if (!creds) {
    throw new Error(
      "Задайте TELEGRAM_API_ID и TELEGRAM_API_HASH (один раз, см. инструкцию)",
    );
  }

  cleanupExpiredQrAuths();
  const authClient = createAuthClient();
  await authClient.connect();

  const authId = crypto.randomUUID();
  const pending: PendingQrAuth = {
    id: authId,
    client: authClient,
    qrUrl: null,
    status: "waiting_scan",
    createdAt: Date.now(),
  };

  pending.loginPromise = authClient
    .signInUserWithQrCode(creds, {
      qrCode: async ({ token }) => {
        pending.qrUrl = `tg://login?token=${token.toString("base64url")}`;
      },
      password: async (hint) => {
        pending.status = "needs_password";
        pending.passwordHint = hint ?? undefined;
        return new Promise<string>((resolve) => {
          pending.resolvePassword = resolve;
        });
      },
      onError: async (error) => {
        pending.status = "error";
        pending.error =
          error instanceof Error ? error.message : "Ошибка QR-авторизации";
        return true;
      },
    })
    .then(async () => {
      const session = authClient.session.save() as string;
      writeTelegramSession(session);
      pending.status = "complete";
      pendingQrAuths.delete(authId);
      await authClient.disconnect();

      const { restartTelegramUserListener } = await import("./index");
      await restartTelegramUserListener();
    })
    .catch((error) => {
      if (pending.status === "complete") return;
      if (pending.status !== "needs_password") {
        pending.status = "error";
        pending.error =
          error instanceof Error ? error.message : "QR-авторизация не удалась";
      }
      void authClient.disconnect();
    });

  pendingQrAuths.set(authId, pending);
  return { authId };
}

export function submitTelegramQrPassword(authId: string, password: string): boolean {
  const pending = pendingQrAuths.get(authId);
  if (!pending?.resolvePassword) return false;
  pending.resolvePassword(password);
  pending.resolvePassword = undefined;
  pending.status = "waiting_scan";
  return true;
}
