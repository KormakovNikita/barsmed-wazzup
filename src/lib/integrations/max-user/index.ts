import { mkdtempSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { WebMaxClient } from "webmaxsocket";
import type { OutboundAttachmentPayload } from "@/lib/types";
import { processMaxUserMessage } from "./message-handler";
import {
  MAX_USER_SESSION_NAME,
  bootstrapMaxUserSessionFromEnv,
  clearMaxUserSession,
  ensureMaxUserSessionDirs,
  hasMaxUserSession,
  persistMaxUserSessionFromWebmaxsocket,
  syncMaxUserSessionToWebmaxsocket,
} from "./session";

let client: WebMaxClient | null = null;
let listenerStarted = false;
let connecting: Promise<WebMaxClient | null> | null = null;

export function getMaxUserMode(): "bot" | "user" {
  const mode = process.env.MAX_MODE?.toLowerCase();
  if (mode === "user") return "user";
  if (mode === "bot") return "bot";
  if (hasMaxUserSession()) return "user";
  return "bot";
}

export function isMaxUserConfigured(): boolean {
  bootstrapMaxUserSessionFromEnv();
  return hasMaxUserSession();
}

export async function resetMaxUserClient(): Promise<void> {
  listenerStarted = false;
  if (client) {
    try {
      await client.stop();
    } catch {
      // ignore disconnect errors during reset
    }
  }
  client = null;
  connecting = null;
}

function createMaxUserClient(): WebMaxClient {
  ensureMaxUserSessionDirs();
  syncMaxUserSessionToWebmaxsocket();

  return new WebMaxClient({
    name: MAX_USER_SESSION_NAME,
    deviceType: "ANDROID",
    logIncoming: false,
    sessionRefreshIntervalMs: 45 * 60 * 1000,
  });
}

export async function getMaxUserClient(): Promise<WebMaxClient | null> {
  if (!isMaxUserConfigured()) return null;

  if (client?.isAuthorized) return client;
  if (connecting) return connecting;

  connecting = (async () => {
    client = createMaxUserClient();
    await client.start();
    persistMaxUserSessionFromWebmaxsocket();
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

export async function isMaxUserAuthorized(): Promise<boolean> {
  try {
    const c = await getMaxUserClient();
    return Boolean(c?.isAuthorized && c.me);
  } catch {
    return false;
  }
}

export async function getMaxUserProfile() {
  const c = await getMaxUserClient();
  if (!c?.me) return null;

  const me = c.me;
  return {
    userId: me.id,
    name:
      me.fullname ||
      [me.firstname, me.lastname].filter(Boolean).join(" ").trim() ||
      "MAX",
    username: me.username ?? undefined,
    phone: me.phone ?? undefined,
  };
}

function writeTempAttachment(attachment: OutboundAttachmentPayload): string {
  const dir = mkdtempSync(join(tmpdir(), "hubdesk-max-out-"));
  const ext =
    attachment.fileName?.includes(".")
      ? `.${attachment.fileName.split(".").pop()}`
      : attachment.type === "voice"
        ? ".ogg"
        : attachment.type === "image"
          ? ".jpg"
          : attachment.type === "video"
            ? ".mp4"
            : ".bin";
  const filePath = join(
    dir,
    attachment.fileName?.replace(/[^\w.\-()+\s]/g, "_") || `file${ext}`,
  );
  writeFileSync(filePath, attachment.buffer as Buffer);
  return filePath;
}

export async function sendMaxUserMessage(
  externalThreadId: string,
  content: string,
  attachments?: OutboundAttachmentPayload[],
  replyToChannelMessageId?: string,
): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  try {
    const c = await getMaxUserClient();
    if (!c?.isAuthorized) {
      return { ok: false, error: "Аккаунт MAX не подключён" };
    }

    const chatId = Number(externalThreadId);
    if (!Number.isFinite(chatId)) {
      return { ok: false, error: "Некорректный ID чата MAX" };
    }

    const replyTo =
      replyToChannelMessageId && /^\d+$/.test(replyToChannelMessageId)
        ? replyToChannelMessageId
        : undefined;

    if (attachments?.length) {
      const attachment = attachments[0];
      const tempPath = writeTempAttachment(attachment);
      let uploadResult: unknown;

      try {
        if (attachment.type === "image") {
          uploadResult = await c.uploadPhoto(chatId, tempPath);
        } else if (attachment.type === "video") {
          uploadResult = await c.uploadVideo(chatId, tempPath);
        } else if (attachment.type === "voice" || attachment.type === "audio") {
          uploadResult = await c.uploadAudio(chatId, tempPath);
        } else {
          uploadResult = await c.uploadFile(chatId, tempPath, {
            filename: attachment.fileName,
            mimeType: attachment.mimeType,
          });
        }
      } finally {
        try {
          unlinkSync(tempPath);
        } catch {
          // ignore temp cleanup
        }
      }

      const result = await c.sendMessage({
        chatId,
        text: content.trim() || undefined,
        replyTo,
        attachments: [uploadResult],
      });

      return { ok: true, externalId: String(result.id) };
    }

    if (!content.trim()) {
      return { ok: false, error: "Пустое сообщение" };
    }

    const result = await c.sendMessage({
      chatId,
      text: content,
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

export async function disconnectMaxUser(): Promise<void> {
  await resetMaxUserClient();
  clearMaxUserSession();
}

export async function restartMaxUserListener(): Promise<void> {
  await resetMaxUserClient();
  await startMaxUserListener();
}

export async function startMaxUserListener(): Promise<void> {
  if (listenerStarted || getMaxUserMode() !== "user") return;

  const c = await getMaxUserClient();
  if (!c?.isAuthorized) return;

  listenerStarted = true;
  console.info("[max-user] starting incoming message listener");

  c.onMessage(async (message) => {
    try {
      await processMaxUserMessage(message, c.me?.id ?? null);
    } catch (error) {
      console.error("[max-user] incoming handler error:", error);
    }
  });

  c.onError((error) => {
    console.error("[max-user] client error:", error);
  });
}

export function getMaxUserStatus() {
  bootstrapMaxUserSessionFromEnv();
  return {
    configured: isMaxUserConfigured(),
    hasSession: hasMaxUserSession(),
    mode: getMaxUserMode(),
  };
}

export { processMaxUserMessage } from "./message-handler";
