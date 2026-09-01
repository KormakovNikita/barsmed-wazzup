import {
  createMaxProxyQrClient,
  resetMaxProxyClient,
  startMaxProxyListener,
} from "@/lib/integrations/max-proxy/client";

interface PendingMaxProxyQr {
  trackId: string;
  qrLink: string;
  expiresAt: number;
  pollingInterval: number;
  client: ReturnType<typeof createMaxProxyQrClient>;
  status: "pending" | "scanned" | "done" | "error" | "expired";
  error?: string;
}

const pending = new Map<string, PendingMaxProxyQr>();

function cleanup(authId: string): void {
  const entry = pending.get(authId);
  if (!entry) return;
  pending.delete(authId);
  entry.client.stop().catch(() => {
    // ignore
  });
}

export async function startMaxProxyQrAuth(): Promise<{ authId: string }> {
  const authId = `max-proxy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const client = createMaxProxyQrClient();

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

  void pollMaxProxyQr(authId);

  return { authId };
}

async function pollMaxProxyQr(authId: string): Promise<void> {
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
        await resetMaxProxyClient();
        await startMaxProxyListener();
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

export function getPendingMaxProxyQr(authId: string): PendingMaxProxyQr | null {
  const entry = pending.get(authId);
  if (!entry) return null;
  if (entry.status === "pending" && Date.now() >= entry.expiresAt) {
    entry.status = "expired";
    entry.error = "QR-код истёк";
  }
  return entry;
}

export async function disconnectMaxProxySession(): Promise<void> {
  await resetMaxProxyClient();
  const { unlinkSync, existsSync } = await import("fs");
  const { join } = await import("path");
  const { getMaxProxySessionName, ensureMaxProxySessionDir } = await import(
    "./session-path"
  );
  ensureMaxProxySessionDir();
  const sessionFile = join(
    process.cwd(),
    "sessions",
    `${getMaxProxySessionName()}.json`,
  );
  if (existsSync(sessionFile)) {
    unlinkSync(sessionFile);
  }
}
