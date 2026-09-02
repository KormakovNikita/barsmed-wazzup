import { existsSync } from "fs";
import {
  createMaxPersonalQrClient,
  resetMaxPersonalClient,
  startMaxPersonalListener,
} from "@/lib/integrations/max-personal/client";

interface PendingMaxPersonalQr {
  trackId: string;
  qrLink: string;
  expiresAt: number;
  pollingInterval: number;
  client: ReturnType<typeof createMaxPersonalQrClient>;
  status: "pending" | "scanned" | "done" | "error" | "expired";
  error?: string;
}

const pending = new Map<string, PendingMaxPersonalQr>();

function cleanup(authId: string): void {
  const entry = pending.get(authId);
  if (!entry) return;
  pending.delete(authId);
  entry.client.stop().catch(() => {
    // ignore
  });
}

export async function startMaxPersonalQrAuth(): Promise<{ authId: string }> {
  const authId = `max-personal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const client = createMaxPersonalQrClient();

  await client.connect();
  const qrData = await client.requestQR();

  pending.set(authId, {
    trackId: qrData.trackId,
    qrLink: qrData.qrLink,
    expiresAt: qrData.expiresAt,
    pollingInterval: qrData.pollingInterval,
    client,
    status: "pending",
  });

  void pollMaxPersonalQr(authId);

  return { authId };
}

async function pollMaxPersonalQr(authId: string): Promise<void> {
  const entry = pending.get(authId);
  if (!entry) return;

  while (entry.status === "pending") {
    if (Date.now() >= entry.expiresAt) {
      entry.status = "expired";
      entry.error = "QR-код истёк";
      return;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, entry.pollingInterval ?? 2000),
    );

    try {
      const status = await entry.client.checkQRStatus(entry.trackId);
      if (status.status?.loginAvailable) {
        entry.status = "scanned";
        await entry.client.loginByQR(entry.trackId);
        await entry.client.sync();
        entry.status = "done";
        await resetMaxPersonalClient();
        await startMaxPersonalListener();
        setTimeout(() => cleanup(authId), 60_000);
        return;
      }
    } catch (error) {
      entry.status = "error";
      entry.error =
        error instanceof Error ? error.message : "Ошибка QR-авторизации";
      return;
    }
  }
}

export function getPendingMaxPersonalQr(
  authId: string,
): PendingMaxPersonalQr | null {
  const entry = pending.get(authId);
  if (!entry) return null;
  if (entry.status === "pending" && Date.now() >= entry.expiresAt) {
    entry.status = "expired";
    entry.error = "QR-код истёк";
  }
  return entry;
}

export async function disconnectMaxPersonalSession(): Promise<void> {
  await resetMaxPersonalClient();
  const { unlinkSync } = await import("fs");
  const { getMaxPersonalSessionFilePath, ensureMaxPersonalSessionDir } =
    await import("./session-path");
  ensureMaxPersonalSessionDir();
  const sessionFile = getMaxPersonalSessionFilePath();
  if (existsSync(sessionFile)) {
    unlinkSync(sessionFile);
  }
}
