import {
  createWhatsAppQrSocket,
  resetWhatsAppClient,
  startWhatsAppListener,
} from "@/lib/integrations/whatsapp/client";
import { clearWhatsAppSession } from "@/lib/integrations/whatsapp/session-path";
import type { WASocket } from "@whiskeysockets/baileys";

interface PendingWhatsAppQr {
  authId: string;
  client: WASocket;
  qr: string | null;
  status: "waiting_scan" | "scanned" | "done" | "error" | "expired";
  error?: string;
  createdAt: number;
}

const pending = new Map<string, PendingWhatsAppQr>();
const QR_TTL_MS = 5 * 60 * 1000;

function cleanupExpired(): void {
  const now = Date.now();
  for (const [id, entry] of pending) {
    if (now - entry.createdAt > QR_TTL_MS && entry.status !== "done") {
      pending.delete(id);
      try {
        entry.client.end(undefined);
      } catch {
        // ignore
      }
    }
  }
}

export function getPendingWhatsAppQr(authId: string): PendingWhatsAppQr | null {
  cleanupExpired();
  const entry = pending.get(authId);
  if (!entry) return null;
  if (entry.status === "waiting_scan" && Date.now() - entry.createdAt > QR_TTL_MS) {
    entry.status = "expired";
    entry.error = "QR-код истёк";
  }
  return entry;
}

export async function startWhatsAppQrAuth(): Promise<{ authId: string }> {
  cleanupExpired();
  const authId = `wa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const entry: PendingWhatsAppQr = {
    authId,
    client: null as unknown as WASocket,
    qr: null,
    status: "waiting_scan",
    createdAt: Date.now(),
  };

  const client = await createWhatsAppQrSocket({
    onQr: (qr) => {
      entry.qr = qr;
    },
    onConnectionOpen: () => {
      entry.status = "done";
      void resetWhatsAppClient().then(() => startWhatsAppListener());
      setTimeout(() => {
        pending.delete(authId);
        try {
          entry.client.end(undefined);
        } catch {
          // ignore
        }
      }, 60_000);
    },
    onConnectionClose: (error) => {
      if (entry.status === "done") return;
      entry.status = "error";
      entry.error = error ?? "Соединение закрыто";
    },
  });

  entry.client = client;
  pending.set(authId, entry);

  return { authId };
}

export async function disconnectWhatsAppSession(): Promise<void> {
  await resetWhatsAppClient();
  clearWhatsAppSession();
}
