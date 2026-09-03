import bigInt from "big-integer";
import { Api } from "teleproto/tl";
import type { TelegramClient } from "teleproto";
import type { EntityLike } from "teleproto/define";
import { getDb } from "@/lib/db";

export type TelegramPeerHint = {
  username?: string;
};

type TelegramPeerRow = {
  peer_id: string;
  access_hash: string | null;
  username: string | null;
};

export function normalizeTelegramUsername(
  value?: string | null,
): string | undefined {
  if (!value) return undefined;
  const match = value.match(/@?([A-Za-z0-9_]{4,})/);
  return match?.[1];
}

export function usernameFromContactNotes(
  notes?: string | null,
): string | undefined {
  if (!notes) return undefined;
  const match = notes.match(/@([A-Za-z0-9_]{4,})/);
  return match?.[1];
}

function readAccessHash(entity: unknown): string | undefined {
  if (!entity || typeof entity !== "object") return undefined;
  const value = (entity as { accessHash?: unknown }).accessHash;
  if (value == null || value === "" || value === "0") return undefined;
  return String(value);
}

function readUsername(entity: unknown): string | undefined {
  if (!entity || typeof entity !== "object") return undefined;
  const value = (entity as { username?: unknown }).username;
  return typeof value === "string" && value.trim()
    ? normalizeTelegramUsername(value)
    : undefined;
}

function readEntityId(entity: unknown): string | undefined {
  if (!entity || typeof entity !== "object" || !("id" in entity)) {
    return undefined;
  }
  const id = (entity as { id?: unknown }).id;
  return id == null ? undefined : String(id);
}

export function rememberTelegramPeer(
  peerId: string,
  entity?: unknown,
  username?: string,
): void {
  const id = peerId.trim();
  if (!id) return;

  const existing = getTelegramPeer(id);
  const accessHash = readAccessHash(entity) ?? existing?.access_hash ?? null;
  const resolvedUsername =
    normalizeTelegramUsername(username) ??
    readUsername(entity) ??
    existing?.username ??
    null;

  getDb()
    .prepare(
      `INSERT INTO telegram_peers (peer_id, access_hash, username, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(peer_id) DO UPDATE SET
         access_hash = COALESCE(excluded.access_hash, telegram_peers.access_hash),
         username = COALESCE(excluded.username, telegram_peers.username),
         updated_at = excluded.updated_at`,
    )
    .run(id, accessHash, resolvedUsername, new Date().toISOString());
}

export function getTelegramPeer(peerId: string): TelegramPeerRow | undefined {
  return getDb()
    .prepare("SELECT peer_id, access_hash, username FROM telegram_peers WHERE peer_id = ?")
    .get(peerId) as TelegramPeerRow | undefined;
}

function buildInputPeerUser(userId: string, accessHash: string) {
  return new Api.InputPeerUser({
    userId: bigInt(userId),
    accessHash: bigInt(accessHash),
  });
}

async function tryGetEntity(
  client: TelegramClient,
  candidate: EntityLike | undefined | null,
): Promise<EntityLike | null> {
  if (candidate == null || candidate === "") return null;
  try {
    return await client.getInputEntity(candidate);
  } catch {
    try {
      return await client.getEntity(candidate);
    } catch {
      return null;
    }
  }
}

export async function resolveTelegramSendEntity(
  client: TelegramClient,
  threadId: string,
  hint?: TelegramPeerHint,
): Promise<EntityLike> {
  const trimmed = threadId.trim();
  const cached = getTelegramPeer(trimmed);
  const username =
    normalizeTelegramUsername(hint?.username) ?? cached?.username;

  const candidates: EntityLike[] = [trimmed];
  if (/^-?\d+$/.test(trimmed)) {
    candidates.push(Number(trimmed));
    try {
      candidates.push(bigInt(trimmed));
    } catch {
      // ignore
    }
  }
  if (username) {
    candidates.push(username, `@${username}`);
  }
  if (cached?.access_hash && /^-?\d+$/.test(trimmed)) {
    try {
      candidates.push(buildInputPeerUser(trimmed, cached.access_hash));
    } catch {
      // ignore invalid hash
    }
  }

  for (const candidate of candidates) {
    const entity = await tryGetEntity(client, candidate);
    if (entity) {
      rememberTelegramPeer(trimmed, entity, username ?? undefined);
      return entity;
    }
  }

  try {
    const dialogs = await client.getDialogs({ limit: 200 });
    for (const dialog of dialogs) {
      const entity = "entity" in dialog ? dialog.entity : dialog;
      const id = readEntityId(entity);
      const dialogUsername = readUsername(entity);
      if (
        id === trimmed ||
        (username && dialogUsername?.toLowerCase() === username.toLowerCase())
      ) {
        rememberTelegramPeer(
          trimmed,
          entity,
          dialogUsername ?? username ?? undefined,
        );
        const resolved = await tryGetEntity(client, entity as EntityLike);
        if (resolved) return resolved;
      }
    }
  } catch (error) {
    console.warn("[telegram-user] dialog lookup failed:", error);
  }

  if (username) {
    try {
      const resolved = await client.invoke(
        new Api.contacts.ResolveUsername({ username }),
      );
      const users = "users" in resolved ? resolved.users : [];
      const user = users.find((item) => "id" in item);
      if (user) {
        rememberTelegramPeer(trimmed, user, username);
        const entity = await tryGetEntity(client, user);
        if (entity) return entity;
      }
    } catch (error) {
      console.warn("[telegram-user] resolveUsername failed:", error);
    }
  }

  throw new Error(
    "Не удалось найти этот чат в Telegram. Попросите клиента написать ещё раз или откройте диалог в приложении Telegram, затем повторите отправку.",
  );
}
