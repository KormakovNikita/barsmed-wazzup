import { WebMaxClient } from "webmaxsocket";
import {
  MAX_USER_SESSION_NAME,
  persistMaxUserSessionFromWebmaxsocket,
  syncMaxUserSessionToWebmaxsocket,
} from "./session";

export interface PendingMaxQrAuth {
  id: string;
  client: WebMaxClient;
  qrLink: string | null;
  trackId: string | null;
  pollingInterval: number;
  expiresAt: number;
  status: "waiting_scan" | "complete" | "error" | "expired";
  error?: string;
  createdAt: number;
  pollTimer?: ReturnType<typeof setInterval>;
}

const pendingQrAuths = new Map<string, PendingMaxQrAuth>();
const QR_TTL_MS = 5 * 60 * 1000;

function cleanupExpiredQrAuths(): void {
  const now = Date.now();
  for (const [id, auth] of pendingQrAuths) {
    if (now - auth.createdAt > QR_TTL_MS) {
      if (auth.pollTimer) clearInterval(auth.pollTimer);
      pendingQrAuths.delete(id);
      void auth.client.stop().catch(() => {});
    }
  }
}

export function getPendingMaxQrAuth(id: string): PendingMaxQrAuth | undefined {
  cleanupExpiredQrAuths();
  return pendingQrAuths.get(id);
}

export function cancelPendingMaxQrAuth(id: string): void {
  const auth = pendingQrAuths.get(id);
  if (!auth) return;
  if (auth.pollTimer) clearInterval(auth.pollTimer);
  pendingQrAuths.delete(id);
  void auth.client.stop().catch(() => {});
}

async function finalizeMaxQrLogin(
  pending: PendingMaxQrAuth,
  trackId: string,
): Promise<void> {
  const loginData = await pending.client.loginByQR(trackId);
  const token = loginData.tokenAttrs?.LOGIN?.token;
  if (!token) {
    throw new Error("Токен не получен после сканирования QR");
  }

  pending.client.session.set("token", token);
  pending.client.session.set("deviceType", "ANDROID");
  persistMaxUserSessionFromWebmaxsocket();

  pending.status = "complete";
  if (pending.pollTimer) clearInterval(pending.pollTimer);
  pendingQrAuths.delete(pending.id);

  await pending.client.stop();

  const { restartMaxUserListener } = await import("./index");
  await restartMaxUserListener();
}

function startQrPolling(pending: PendingMaxQrAuth): void {
  if (!pending.trackId) return;

  pending.pollTimer = setInterval(() => {
    void (async () => {
      if (pending.status !== "waiting_scan") return;

      if (Date.now() >= pending.expiresAt) {
        pending.status = "expired";
        if (pending.pollTimer) clearInterval(pending.pollTimer);
        await pending.client.stop().catch(() => {});
        return;
      }

      try {
        const statusResponse = await pending.client.checkQRStatus(
          pending.trackId!,
        );
        if (statusResponse.status?.loginAvailable) {
          await finalizeMaxQrLogin(pending, pending.trackId!);
        }
      } catch (error) {
        pending.status = "error";
        pending.error =
          error instanceof Error ? error.message : "Ошибка проверки QR";
        if (pending.pollTimer) clearInterval(pending.pollTimer);
        await pending.client.stop().catch(() => {});
      }
    })();
  }, Math.max(pending.pollingInterval, 2000));
}

export async function startMaxQrAuth(): Promise<{ authId: string }> {
  cleanupExpiredQrAuths();
  syncMaxUserSessionToWebmaxsocket();

  const client = new WebMaxClient({
    name: MAX_USER_SESSION_NAME,
    deviceType: "WEB",
    logIncoming: false,
  });

  await client.connect();
  const qrData = await client.requestQR();

  if (
    !qrData.qrLink ||
    !qrData.trackId ||
    !qrData.pollingInterval ||
    !qrData.expiresAt
  ) {
    await client.stop();
    throw new Error("Неполные данные QR-кода от MAX");
  }

  const authId = crypto.randomUUID();
  const pending: PendingMaxQrAuth = {
    id: authId,
    client,
    qrLink: qrData.qrLink,
    trackId: qrData.trackId,
    pollingInterval: qrData.pollingInterval,
    expiresAt: qrData.expiresAt,
    status: "waiting_scan",
    createdAt: Date.now(),
  };

  pendingQrAuths.set(authId, pending);
  startQrPolling(pending);

  return { authId };
}
