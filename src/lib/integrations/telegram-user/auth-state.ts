import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";
import type { ApiCredentials } from "teleproto/client/auth";

export interface PendingTelegramAuth {
  id: string;
  phoneNumber: string;
  phoneCodeHash: string;
  isCodeViaApp: boolean;
  client: TelegramClient;
  createdAt: number;
}

const pendingAuths = new Map<string, PendingTelegramAuth>();
const AUTH_TTL_MS = 10 * 60 * 1000;

export function getApiCredentials(): ApiCredentials | null {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  if (!apiId || !apiHash) return null;
  return { apiId, apiHash };
}

export function createAuthClient(): TelegramClient {
  const creds = getApiCredentials();
  if (!creds) {
    throw new Error("TELEGRAM_API_ID и TELEGRAM_API_HASH обязательны");
  }

  return new TelegramClient(new StringSession(""), creds.apiId, creds.apiHash, {
    connectionRetries: 5,
  });
}

export function storePendingAuth(data: PendingTelegramAuth): void {
  cleanupExpiredAuths();
  pendingAuths.set(data.id, data);
}

export function getPendingAuth(id: string): PendingTelegramAuth | undefined {
  cleanupExpiredAuths();
  return pendingAuths.get(id);
}

export function deletePendingAuth(id: string): void {
  pendingAuths.delete(id);
}

function cleanupExpiredAuths(): void {
  const now = Date.now();
  for (const [id, auth] of pendingAuths) {
    if (now - auth.createdAt > AUTH_TTL_MS) {
      pendingAuths.delete(id);
      void auth.client.disconnect();
    }
  }
}
