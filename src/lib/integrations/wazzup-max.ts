import { mediaPreviewLabel } from "@/lib/media-storage";
import type {
  IncomingAttachmentPayload,
  IncomingMessagePayload,
  MessageMediaType,
  OutboundMessagePayload,
} from "@/lib/types";
import { isWazzupConfigured, findWazzupMaxChannelId, listWazzupMaxChannels } from "@/lib/integrations/wazzup-import";
import {
  getWazzupWebhookInfo,
  listWazzupChannels,
} from "@/lib/integrations/wazzup-telegram";

export type MaxIncomingMode = "bot" | "wazzup";

export interface WazzupMaxWebhookMessage {
  messageId: string;
  channelId: string;
  chatType: string;
  chatId: string;
  dateTime?: string;
  type?: string;
  status?: string;
  text?: string;
  contentUri?: string;
  authorName?: string;
  isEcho?: boolean;
  contact?: {
    name?: string;
    username?: string;
    phone?: string;
  };
}

const MAX_CHAT_TYPES = new Set(["max", "maxbot", "maxgroup"]);

function normalizeBaseUrl(base: string | undefined): string | null {
  const trimmed = base?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/$/, "");
}

/** MAX platform accepts only HTTPS webhook URLs (no raw IP:port). */
export function getMaxWebhookBaseUrl(): string | null {
  const base = normalizeBaseUrl(process.env.WEBHOOK_BASE_URL);
  if (!base) return null;
  try {
    const url = new URL(base);
    if (url.protocol !== "https:") return null;
    return base;
  } catch {
    return null;
  }
}

/** Wazzup can use HTTP/IP; dedicated env avoids blocking MAX polling. */
export function getWazzupWebhookBaseUrl(): string | null {
  return (
    normalizeBaseUrl(process.env.WAZZUP_WEBHOOK_BASE_URL) ??
    normalizeBaseUrl(process.env.WEBHOOK_BASE_URL)
  );
}

export function shouldMaxUsePolling(): boolean {
  return !getMaxWebhookBaseUrl();
}

export function getMaxIncomingMode(): MaxIncomingMode {
  return process.env.MAX_INCOMING?.toLowerCase() === "wazzup" ? "wazzup" : "bot";
}

export function isWazzupMaxIncomingConfigured(): boolean {
  return isWazzupConfigured() && getMaxIncomingMode() === "wazzup";
}

/** In wazzup mode all MAX traffic goes through Wazzup; Bot API is disabled. */
export function shouldUseMaxBotIncoming(): boolean {
  return getMaxIncomingMode() !== "wazzup";
}

export function isMaxIncomingConfigured(): boolean {
  if (getMaxIncomingMode() === "wazzup") {
    return isWazzupMaxIncomingConfigured();
  }
  return Boolean(process.env.MAX_BOT_TOKEN);
}

export function getPublicAppBaseUrl(): string | null {
  return getWazzupWebhookBaseUrl() ?? getMaxWebhookBaseUrl();
}

export function isWazzupMaxVoiceMessage(msg: WazzupMaxWebhookMessage): boolean {
  if (msg.isEcho) return false;
  const msgType = (msg.type ?? "text").toLowerCase();
  if (["audio", "voice", "ptt"].includes(msgType)) return true;
  if (isAudioContentUri(msg.contentUri)) return true;
  return false;
}

export function shouldWazzupHandleMaxMessage(msg: WazzupMaxWebhookMessage): boolean {
  return isWazzupMaxMessage(msg);
}

export function isWazzupMaxMessage(msg: WazzupMaxWebhookMessage): boolean {
  return MAX_CHAT_TYPES.has(msg.chatType?.toLowerCase() ?? "");
}

function isAudioContentUri(contentUri?: string): boolean {
  const uri = (contentUri ?? "").toLowerCase();
  return /\.(ogg|opus|oga|was|mp3|wav|m4a|aac)(?:\?|$)/.test(uri);
}

function mapWazzupMediaType(type: string, contentUri?: string): MessageMediaType {
  if (isAudioContentUri(contentUri)) {
    const uri = (contentUri ?? "").toLowerCase();
    if (/\.(ogg|opus|oga|was)(?:\?|$)/.test(uri)) return "voice";
    return "audio";
  }

  const lower = type.toLowerCase();
  if (lower === "image") return "image";
  if (lower === "video") return "video";
  if (lower === "audio" || lower === "voice" || lower === "ptt") return "voice";
  if (lower === "document" || lower === "file") return "document";
  return "document";
}

function guessFileName(contentUri: string, type: string): string | undefined {
  try {
    const url = new URL(contentUri);
    const fromQuery = url.searchParams.get("filename");
    if (fromQuery) return fromQuery;
    const pathPart = url.pathname.split("/").pop();
    if (pathPart && pathPart.includes(".")) return pathPart;
  } catch {
    // ignore malformed URLs
  }

  if (type === "audio") return "voice.mp3";
  if (type === "image") return "image.jpg";
  if (type === "video") return "video.mp4";
  return undefined;
}

function guessMimeType(type: string, contentType: string | null, fileName?: string): string {
  if (contentType && contentType !== "application/octet-stream") {
    return contentType.split(";")[0]?.trim() || "application/octet-stream";
  }

  const lower = (fileName ?? "").toLowerCase();
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".ogg") || lower.endsWith(".opus") || lower.endsWith(".was")) {
    return "audio/ogg";
  }
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".pdf")) return "application/pdf";

  if (type === "audio") return "audio/mpeg";
  if (type === "image") return "image/jpeg";
  if (type === "video") return "video/mp4";
  return "application/octet-stream";
}

async function downloadWazzupContent(
  contentUri: string,
  type: string,
): Promise<IncomingAttachmentPayload | null> {
  try {
    const headers: HeadersInit = {};
    if (process.env.WAZZUP_API_KEY) {
      headers.Authorization = `Bearer ${process.env.WAZZUP_API_KEY}`;
    }

    const response = await fetch(contentUri, { cache: "no-store", headers });
    if (!response.ok) {
      console.error(
        `[wazzup-max] download failed ${response.status}:`,
        contentUri.slice(0, 120),
      );
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) return null;

    const fileName = guessFileName(contentUri, type);
    const mimeType = guessMimeType(
      type,
      response.headers.get("content-type"),
      fileName,
    );
    const mediaType = mapWazzupMediaType(type, contentUri);

    return {
      type: mediaType,
      mimeType,
      fileName,
      fileSize: buffer.length,
      buffer,
    };
  } catch (error) {
    console.error("[wazzup-max] download error:", error);
    return null;
  }
}

export async function parseWazzupMaxMessage(
  msg: WazzupMaxWebhookMessage,
): Promise<IncomingMessagePayload | null> {
  if (!shouldWazzupHandleMaxMessage(msg)) return null;

  const msgType = (msg.type ?? "text").toLowerCase();
  const isOutbound = msg.isEcho === true;
  const contactName =
    msg.contact?.name ??
    msg.authorName ??
    (isOutbound ? "БАРСМЕД" : "Клиент MAX");

  let attachments: IncomingAttachmentPayload[] | undefined;
  if (msg.contentUri) {
    const effectiveType = isAudioContentUri(msg.contentUri)
      ? "audio"
      : msgType;
    const canDownload =
      ["image", "audio", "video", "document", "file", "voice", "ptt"].includes(
        effectiveType,
      ) || isAudioContentUri(msg.contentUri);

    if (canDownload) {
      const downloaded = await downloadWazzupContent(msg.contentUri, effectiveType);
      attachments = downloaded ? [downloaded] : undefined;
      if (!attachments?.length) {
        console.warn(
          "[wazzup-max] media download failed:",
          msg.messageId,
          effectiveType,
          msg.contentUri.slice(0, 120),
        );
      }
    }
  }

  const text = msg.text?.trim() ?? "";
  let content = text;
  if (!content && attachments?.length) {
    content = mediaPreviewLabel(attachments[0].type, attachments[0].fileName);
  } else if (!content && msgType === "audio") {
    content = mediaPreviewLabel("voice");
  } else if (!content && msgType === "image") {
    content = mediaPreviewLabel("image");
  } else if (!content && msgType === "video") {
    content = mediaPreviewLabel("video");
  } else if (!content && msgType === "document") {
    content = mediaPreviewLabel("document");
  }

  if (!content && !attachments?.length) return null;

  return {
    channel: "max",
    externalThreadId: msg.chatId,
    externalMessageId: `wazzup-max-${msg.messageId}`,
    channelMessageId: msg.messageId,
    content,
    senderName: contactName,
    senderUsername: msg.contact?.username,
    maxChatId: msg.chatId,
    maxUserId: isOutbound ? undefined : msg.chatId,
    direction: isOutbound ? "out" : "in",
    attachments,
  };
}

export async function getWazzupMaxStatus(): Promise<{
  configured: boolean;
  connected: boolean;
  channelId: string | null;
  channelName: string | null;
  transport: string | null;
  webhookUrl: string | null;
  error?: string;
}> {
  if (!isWazzupConfigured()) {
    return {
      configured: false,
      connected: false,
      channelId: null,
      channelName: null,
      transport: null,
      webhookUrl: null,
    };
  }

  const channels = await listWazzupMaxChannels();
  const channelId = await findWazzupMaxChannelId();
  const channel = channels.find((ch) => ch.channelId === channelId);

  if (!channelId || !channel) {
    return {
      configured: true,
      connected: false,
      channelId: null,
      channelName: null,
      transport: null,
      webhookUrl: null,
      error:
        "Не найден MAX/maxbot канал в Wazzup. Подключите бота MAX в личном кабинете Wazzup.",
    };
  }

  if (channel.state !== "active") {
    return {
      configured: true,
      connected: false,
      channelId,
      channelName: channel.name ?? channel.plainId ?? null,
      transport: channel.transport ?? null,
      webhookUrl: null,
      error: `Канал Wazzup в статусе «${channel.state}». Активируйте канал MAX в личном кабинете Wazzup.`,
    };
  }

  const webhookInfo = await getWazzupWebhookInfo();

  return {
    configured: true,
    connected: true,
    channelId,
    channelName: channel?.name ?? channel?.plainId ?? null,
    transport: channel?.transport ?? null,
    webhookUrl: webhookInfo.webhooksUri ?? null,
  };
}

export { findWazzupMaxChannelId };

function resolveWazzupMaxChatType(transport: string | null | undefined): string {
  if (transport === "maxgroup") return "maxgroup";
  return "max";
}

async function postWazzupMaxRequest(
  body: Record<string, string>,
): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  const response = await fetch("https://api.wazzup24.com/v3/message", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WAZZUP_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as {
    messageId?: string;
    error?: string;
    description?: string;
    data?: Array<{ code?: string; description?: string }>;
  };

  if (!response.ok) {
    const detail = data.data?.[0];
    const friendly =
      detail?.code === "CHANNEL_NOT_FOUND"
        ? "Канал MAX в Wazzup не найден или заблокирован. Проверьте WAZZUP_MAX_CHANNEL_ID."
        : detail?.description;
    return {
      ok: false,
      error: friendly ?? data.description ?? data.error ?? `Wazzup ${response.status}`,
    };
  }

  return {
    ok: true,
    externalId: data.messageId,
  };
}

export async function sendWazzupMaxMessage(
  payload: OutboundMessagePayload & { attachmentUrls?: string[] },
): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  if (!isWazzupConfigured()) {
    return { ok: false, error: "WAZZUP_API_KEY не задан" };
  }

  const channelId = await findWazzupMaxChannelId();
  if (!channelId) {
    return {
      ok: false,
      error: "Не найден MAX/maxbot канал в Wazzup",
    };
  }

  const channels = await listWazzupChannels();
  const channel = channels.find((ch) => ch.channelId === channelId);
  const chatType = resolveWazzupMaxChatType(channel?.transport);
  const threadId = payload.externalThreadId.trim();
  const baseBody = {
    channelId,
    chatType,
    chatId: threadId,
  };

  const text = payload.content.trim();
  const attachmentUrl = payload.attachmentUrls?.[0];

  function withReply(body: Record<string, string>): Record<string, string> {
    if (!payload.replyToChannelMessageId) return body;
    return { ...body, refMessageId: payload.replyToChannelMessageId };
  }

  // Wazzup allows only text OR contentUri per request — send both when needed.
  if (attachmentUrl && text) {
    const textResult = await postWazzupMaxRequest(
      withReply({
        ...baseBody,
        text,
      }),
    );
    if (!textResult.ok) return textResult;

    const fileResult = await postWazzupMaxRequest({
      ...baseBody,
      contentUri: attachmentUrl,
    });
    if (!fileResult.ok) return fileResult;

    return {
      ok: true,
      externalId: fileResult.externalId ?? textResult.externalId,
    };
  }

  if (attachmentUrl) {
    return postWazzupMaxRequest({
      ...baseBody,
      contentUri: attachmentUrl,
    });
  }

  if (text) {
    return postWazzupMaxRequest(
      withReply({
        ...baseBody,
        text,
      }),
    );
  }

  return { ok: false, error: "Пустое сообщение" };
}
