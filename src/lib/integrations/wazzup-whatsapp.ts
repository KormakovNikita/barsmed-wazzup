import { mediaPreviewLabel } from "@/lib/media-storage";
import type {
  IncomingAttachmentPayload,
  IncomingMessagePayload,
  MessageMediaType,
  OutboundMessagePayload,
} from "@/lib/types";
import { isWazzupConfigured } from "@/lib/integrations/wazzup-import";
import {
  getWazzupWebhookInfo,
  listWazzupChannels,
} from "@/lib/integrations/wazzup-telegram";

export interface WazzupWhatsAppWebhookMessage {
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

const WHATSAPP_TRANSPORTS = new Set(["whatsapp", "wapi"]);

export function isWazzupWhatsAppConfigured(): boolean {
  return isWazzupConfigured();
}

export function isWazzupWhatsAppMessage(msg: WazzupWhatsAppWebhookMessage): boolean {
  return (msg.chatType?.toLowerCase() ?? "") === "whatsapp";
}

/** Normalize phone to Wazzup chatId: digits only, 7XXXXXXXXXX for RU. */
export function normalizeWhatsAppPhone(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("8") && digits.length === 11) {
    digits = `7${digits.slice(1)}`;
  }
  return digits;
}

export function formatWhatsAppPhoneDisplay(phone: string): string {
  const digits = normalizeWhatsAppPhone(phone);
  if (digits.length === 11 && digits.startsWith("7")) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`;
  }
  return digits.startsWith("+") ? digits : `+${digits}`;
}

export async function findWazzupWhatsAppChannelId(): Promise<string | null> {
  const configured = process.env.WAZZUP_WHATSAPP_CHANNEL_ID?.trim();
  const channels = await listWazzupWhatsAppChannels();

  if (configured) {
    const match = channels.find((ch) => ch.channelId === configured);
    if (match?.state === "active") return match.channelId;
    console.warn(
      `[wazzup-whatsapp] configured channel ${configured} is ${match?.state ?? "missing"}, using active fallback`,
    );
  }

  const active = channels.find((ch) => ch.state === "active");
  if (active) return active.channelId;

  return channels[0]?.channelId ?? null;
}

async function listWazzupWhatsAppChannels() {
  const channels = await listWazzupChannels();
  return channels.filter((ch) =>
    WHATSAPP_TRANSPORTS.has(ch.transport?.toLowerCase() ?? ""),
  );
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
        `[wazzup-whatsapp] download failed ${response.status}:`,
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
    console.error("[wazzup-whatsapp] download error:", error);
    return null;
  }
}

export async function parseWazzupWhatsAppMessage(
  msg: WazzupWhatsAppWebhookMessage,
): Promise<IncomingMessagePayload | null> {
  if (!isWazzupWhatsAppMessage(msg)) return null;

  const msgType = (msg.type ?? "text").toLowerCase();
  const isOutbound = msg.isEcho === true;
  const phone = normalizeWhatsAppPhone(msg.chatId);
  const contactName =
    msg.contact?.name ??
    msg.authorName ??
    (phone ? formatWhatsAppPhoneDisplay(phone) : "WhatsApp");

  let attachments: IncomingAttachmentPayload[] | undefined;
  if (msg.contentUri) {
    const effectiveType = isAudioContentUri(msg.contentUri) ? "audio" : msgType;
    const canDownload =
      ["image", "audio", "video", "document", "file", "voice", "ptt"].includes(
        effectiveType,
      ) || isAudioContentUri(msg.contentUri);

    if (canDownload) {
      const downloaded = await downloadWazzupContent(msg.contentUri, effectiveType);
      attachments = downloaded ? [downloaded] : undefined;
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
    channel: "whatsapp",
    externalThreadId: phone || msg.chatId,
    externalMessageId: `wazzup-wa-${msg.messageId}`,
    channelMessageId: msg.messageId,
    content,
    senderName: contactName,
    direction: isOutbound ? "out" : "in",
    attachments,
  };
}

export async function getWazzupWhatsAppStatus(): Promise<{
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

  const channels = await listWazzupWhatsAppChannels();
  const channelId = await findWazzupWhatsAppChannelId();
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
        "Не найден WhatsApp-канал в Wazzup. Подключите WhatsApp Business в личном кабинете Wazzup (нужен VPN на стороне Wazzup).",
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
      error: `Канал Wazzup в статусе «${channel.state}». Проверьте подключение WhatsApp в Wazzup (в РФ — через VPN).`,
    };
  }

  const webhookInfo = await getWazzupWebhookInfo();

  return {
    configured: true,
    connected: true,
    channelId,
    channelName: channel.name ?? channel.plainId ?? null,
    transport: channel.transport ?? null,
    webhookUrl: webhookInfo.webhooksUri ?? null,
  };
}

async function postWazzupWhatsAppRequest(
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
        ? "Канал WhatsApp в Wazzup не найден. Проверьте WAZZUP_WHATSAPP_CHANNEL_ID."
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

export async function sendWazzupWhatsAppMessage(
  payload: OutboundMessagePayload & { attachmentUrls?: string[] },
): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  if (!isWazzupConfigured()) {
    return { ok: false, error: "WAZZUP_API_KEY не задан" };
  }

  const channelId = await findWazzupWhatsAppChannelId();
  if (!channelId) {
    return {
      ok: false,
      error: "Не найден WhatsApp-канал в Wazzup",
    };
  }

  const chatId = normalizeWhatsAppPhone(payload.externalThreadId);
  if (!chatId || chatId.length < 10) {
    return { ok: false, error: "Некорректный номер WhatsApp" };
  }

  const baseBody = {
    channelId,
    chatType: "whatsapp",
    chatId,
  };

  const text = payload.content.trim();
  const attachmentUrl = payload.attachmentUrls?.[0];

  function withReply(body: Record<string, string>): Record<string, string> {
    if (!payload.replyToChannelMessageId) return body;
    return { ...body, refMessageId: payload.replyToChannelMessageId };
  }

  if (attachmentUrl && text) {
    const textResult = await postWazzupWhatsAppRequest(
      withReply({
        ...baseBody,
        text,
      }),
    );
    if (!textResult.ok) return textResult;

    const fileResult = await postWazzupWhatsAppRequest({
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
    return postWazzupWhatsAppRequest({
      ...baseBody,
      contentUri: attachmentUrl,
    });
  }

  if (text) {
    return postWazzupWhatsAppRequest(
      withReply({
        ...baseBody,
        text,
      }),
    );
  }

  return { ok: false, error: "Пустое сообщение" };
}
