import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";
import { Api } from "teleproto/tl";
import { NewMessage, EditedMessage } from "teleproto/events";
import {
  createAuthClient,
  deletePendingAuth,
  getApiCredentials,
  getPendingAuth,
  storePendingAuth,
  type PendingTelegramAuth,
} from "./auth-state";
import { processTelegramUserMessage } from "./message-handler";
import { getTelegramClientOptions } from "./proxy";
import {
  clearTelegramSession,
  hasTelegramSession,
  readTelegramSession,
  writeTelegramSession,
} from "./session";

let client: TelegramClient | null = null;
let listenerStarted = false;
let connecting: Promise<TelegramClient | null> | null = null;

export function isTelegramUserConfigured(): boolean {
  return Boolean(getApiCredentials());
}

export function getTelegramUserMode(): "user" | "bot" | "wazzup" {
  const mode = process.env.TELEGRAM_MODE;
  if (mode === "wazzup") return "wazzup";
  if (mode === "bot") return "bot";
  if (mode === "user") return "user";
  if (process.env.WAZZUP_API_KEY && mode !== "bot" && mode !== "user") {
    return "wazzup";
  }
  if (getApiCredentials()) return "user";
  if (process.env.TELEGRAM_BOT_TOKEN) return "bot";
  return "user";
}

export async function resetTelegramUserClient(): Promise<void> {
  listenerStarted = false;
  if (client?.connected) {
    try {
      await client.disconnect();
    } catch {
      // ignore disconnect errors during reset
    }
  }
  client = null;
  connecting = null;
}

export async function getTelegramUserClient(): Promise<TelegramClient | null> {
  const creds = getApiCredentials();
  if (!creds) return null;

  if (client?.connected) return client;

  if (connecting) return connecting;

  connecting = (async () => {
    const sessionString = readTelegramSession();
    if (!sessionString) return null;

    client = new TelegramClient(
      new StringSession(sessionString),
      creds.apiId,
      creds.apiHash,
      getTelegramClientOptions(),
    );

    await client.connect();
    return client;
  })();

  try {
    return await connecting;
  } catch (error) {
    client = null;
    listenerStarted = false;
    throw error;
  } finally {
    connecting = null;
  }
}

export async function isTelegramUserAuthorized(): Promise<boolean> {
  try {
    const c = await getTelegramUserClient();
    if (!c) return false;
    return c.isUserAuthorized();
  } catch {
    return false;
  }
}

export async function getTelegramUserProfile() {
  const c = await getTelegramUserClient();
  if (!c || !(await c.isUserAuthorized())) return null;

  const me = await c.getMe();
  return {
    id: String(me.id),
    name: [me.firstName, me.lastName].filter(Boolean).join(" "),
    username: me.username ?? undefined,
    phone: me.phone ?? undefined,
  };
}

export async function sendTelegramUserMessage(
  externalThreadId: string,
  content: string,
  attachments?: import("@/lib/types").OutboundAttachmentPayload[],
  replyToChannelMessageId?: string,
): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  try {
    const c = await getTelegramUserClient();
    if (!c || !(await c.isUserAuthorized())) {
      return { ok: false, error: "Личный Telegram не подключён" };
    }

    const entity = await c.getEntity(externalThreadId);
    const replyTo = replyToChannelMessageId &&
      Number.isFinite(Number(replyToChannelMessageId))
      ? Number(replyToChannelMessageId)
      : undefined;

    if (attachments?.length) {
      const attachment = attachments[0];
      const fileBuffer = attachment.buffer as Buffer & { name?: string };
      fileBuffer.name = attachment.fileName ?? `file.${attachment.mimeType.split("/")[1] ?? "bin"}`;

      const result = await c.sendFile(entity, {
        file: fileBuffer,
        caption: content.trim() || undefined,
        forceDocument:
          attachment.type === "document" ||
          attachment.type === "audio" ||
          attachment.type === "voice",
        voiceNote: attachment.type === "voice",
        replyTo,
      });

      return { ok: true, externalId: String(result.id) };
    }

    if (!content.trim()) {
      return { ok: false, error: "Пустое сообщение" };
    }

    const result = await c.sendMessage(entity, {
      message: content,
      replyTo,
    });
    return { ok: true, externalId: String(result.id) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Ошибка отправки",
    };
  }
}

export async function deleteTelegramUserMessages(
  externalThreadId: string,
  messageIds: string[],
  revoke = false,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const c = await getTelegramUserClient();
    if (!c || !(await c.isUserAuthorized())) {
      return { ok: false, error: "Личный Telegram не подключён" };
    }

    const entity = await c.getEntity(externalThreadId);
    const numericIds = messageIds
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id));
    if (!numericIds.length) {
      return { ok: false, error: "Некорректный ID сообщения" };
    }

    await c.deleteMessages(entity, numericIds, { revoke });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Ошибка удаления",
    };
  }
}

export async function editTelegramUserMessage(
  externalThreadId: string,
  messageId: string,
  content: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const c = await getTelegramUserClient();
    if (!c || !(await c.isUserAuthorized())) {
      return { ok: false, error: "Личный Telegram не подключён" };
    }

    const entity = await c.getEntity(externalThreadId);
    const numericId = Number(messageId);
    if (!Number.isFinite(numericId)) {
      return { ok: false, error: "Некорректный ID сообщения" };
    }

    await c.editMessage(entity, {
      message: numericId,
      text: content,
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Ошибка редактирования",
    };
  }
}

export async function resolveTelegramPeer(
  identifier: string,
): Promise<{ peerId: string; name: string; username?: string } | null> {
  try {
    const c = await getTelegramUserClient();
    if (!c || !(await c.isUserAuthorized())) return null;

    const normalized = identifier.trim();
    const entity = await c.getEntity(normalized);
    if (!entity || !("id" in entity)) return null;

    const peerId = String(entity.id);
    const name =
      "firstName" in entity
        ? [entity.firstName, entity.lastName].filter(Boolean).join(" ")
        : "title" in entity
          ? String(entity.title)
          : normalized;

    const username = "username" in entity ? entity.username : undefined;

    return { peerId, name, username: username ?? undefined };
  } catch {
    return null;
  }
}

export async function startTelegramAuth(phoneNumber: string) {
  const creds = getApiCredentials();
  if (!creds) {
    throw new Error("Задайте TELEGRAM_API_ID и TELEGRAM_API_HASH");
  }

  const authClient = createAuthClient();
  await authClient.connect();

  const result = await authClient.sendCode(creds, phoneNumber);
  const authId = crypto.randomUUID();

  storePendingAuth({
    id: authId,
    phoneNumber,
    phoneCodeHash: result.phoneCodeHash,
    isCodeViaApp: result.isCodeViaApp,
    client: authClient,
    createdAt: Date.now(),
  });

  return {
    authId,
    isCodeViaApp: result.isCodeViaApp,
  };
}

export async function completeTelegramAuth(
  authId: string,
  code: string,
  password?: string,
) {
  const pending = getPendingAuth(authId);
  if (!pending) {
    throw new Error("Сессия авторизации истекла, запросите код снова");
  }

  const creds = getApiCredentials();
  if (!creds) {
    throw new Error("TELEGRAM_API_ID и TELEGRAM_API_HASH не заданы");
  }

  try {
    await pending.client.invoke(
      new Api.auth.SignIn({
        phoneNumber: pending.phoneNumber,
        phoneCodeHash: pending.phoneCodeHash,
        phoneCode: code,
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    if (message.includes("SESSION_PASSWORD_NEEDED")) {
      if (!password) {
        return { needsPassword: true as const };
      }

      await pending.client.signInWithPassword(creds, {
        password: async () => password,
        onError: async () => false,
      });
    } else {
      throw error;
    }
  }

  await finalizeAuthorizedClient(pending);
  deletePendingAuth(authId);

  const profile = await getTelegramUserProfile();
  return { ok: true as const, profile };
}

async function finalizeAuthorizedClient(pending: PendingTelegramAuth) {
  await resetTelegramUserClient();

  client = pending.client;
  const session = client.session.save() as string;
  writeTelegramSession(session);
  await startTelegramUserListener();
}

export async function disconnectTelegramUser() {
  await resetTelegramUserClient();
  clearTelegramSession();
}

export async function restartTelegramUserListener(): Promise<void> {
  await resetTelegramUserClient();
  await startTelegramUserListener();
}

export async function startTelegramUserListener() {
  if (listenerStarted) return;

  const c = await getTelegramUserClient();
  if (!c || !(await c.isUserAuthorized())) return;

  listenerStarted = true;
  console.info("[telegram-user] starting incoming message listener");

  c.addEventHandler(
    async (event) => {
      try {
        await processTelegramUserMessage(event.message, c);
      } catch (error) {
        console.error("[telegram-user] message handler error:", error);
      }
    },
    new NewMessage({}),
  );

  c.addEventHandler(
    async (event) => {
      try {
        await processTelegramUserMessage(event.message, c);
      } catch (error) {
        console.error("[telegram-user] edited message handler error:", error);
      }
    },
    new EditedMessage({}),
  );
}

export function getTelegramUserStatus() {
  return {
    configured: isTelegramUserConfigured(),
    hasSession: hasTelegramSession(),
  };
}

export { processTelegramUserMessage } from "./message-handler";
