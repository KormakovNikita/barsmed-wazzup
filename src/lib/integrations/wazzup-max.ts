import { mediaPreviewLabel } from "@/lib/media-storage";
import type {
  IncomingAttachmentPayload,
  IncomingMessagePayload,
  MessageMediaType,
} from "@/lib/types";
import { isWazzupConfigured, findWazzupMaxChannelId } from "@/lib/integrations/wazzup-import";
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

/** Bot API stays on in wazzup mode — Wazzup only supplements voice messages. */
export function shouldUseMaxBotIncoming(): boolean {
  return true;
}

export function isWazzupMaxVoiceMessage(msg: WazzupMaxWebhookMessage): boolean {
  if (msg.isEcho) return false;
  const msgType = (msg.type ?? "text").toLowerCase();
  if (msgType === "audio") return true;
  const uri = (msg.contentUri ?? "").toLowerCase();
  return /\.(ogg|opus|oga|was|mp3|wav|m4a|aac)(?:\?|$)/.test(uri);
}

export function shouldWazzupHandleMaxMessage(msg: WazzupMaxWebhookMessage): boolean {
  if (!isWazzupMaxMessage(msg)) return false;
  if (getMaxIncomingMode() !== "wazzup") return true;
  return isWazzupMaxVoiceMessage(msg);
}

export function isWazzupMaxMessage(msg: WazzupMaxWebhookMessage): boolean {
  return MAX_CHAT_TYPES.has(msg.chatType?.toLowerCase() ?? "");
}

function mapWazzupMediaType(type: string, contentUri?: string): MessageMediaType {
  const lower = type.toLowerCase();
  if (lower === "image") return "image";
  if (lower === "video") return "video";
  if (lower === "audio") return "voice";
  if (lower === "document" || lower === "file") {
    const uri = (contentUri ?? "").toLowerCase();
    if (/\.(ogg|opus|oga|was)(?:\?|$)/.test(uri)) return "voice";
    if (/\.(mp3|wav|m4a|aac)(?:\?|$)/.test(uri)) return "audio";
    return "document";
  }
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
    const response = await fetch(contentUri, { cache: "no-store" });
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
  if (msg.contentUri && ["image", "audio", "video", "document", "file"].includes(msgType)) {
    const downloaded = await downloadWazzupContent(msg.contentUri, msgType);
    attachments = downloaded ? [downloaded] : undefined;
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

  const channels = await listWazzupChannels();
  const channelId = await findWazzupMaxChannelId();
  const channel = channels.find((ch) => ch.channelId === channelId);

  if (!channelId) {
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
