import { getMaxApiBase, getMaxBotToken } from "@/lib/integrations/max";
import { mediaPreviewLabel } from "@/lib/media-storage";
import type {
  IncomingAttachmentPayload,
  MessageMediaType,
} from "@/lib/types";

export interface MaxMessageAttachment {
  type: string;
  payload?: {
    url?: string;
    token?: string;
    photo_id?: number;
    fileId?: number;
  };
  filename?: string;
  size?: number;
  /** Present on audio/voice attachments in some API responses */
  duration?: number;
}

const MEDIA_TYPES = new Set(["image", "video", "audio", "voice", "file"]);

function isAudioFileName(fileName?: string): boolean {
  if (!fileName) return false;
  return /\.(ogg|opus|mp3|wav|m4a|aac|oga)$/i.test(fileName);
}

function isAudioMime(mimeType: string): boolean {
  return mimeType.startsWith("audio/") || mimeType === "application/ogg";
}

export function isMaxMediaAttachment(
  attachment: MaxMessageAttachment,
): boolean {
  if (MEDIA_TYPES.has(attachment.type)) return true;
  if (attachment.type === "file" && isAudioFileName(attachment.filename)) {
    return true;
  }
  return false;
}

function mapMaxMediaType(
  type: string,
  fileName?: string,
  mimeType?: string,
): MessageMediaType {
  if (type === "voice") return "voice";
  if (type === "audio") return "voice";
  if (type === "image") return "image";
  if (type === "video") return "video";
  if (type === "file") {
    if (isAudioFileName(fileName) || (mimeType && isAudioMime(mimeType))) {
      return "voice";
    }
    return "document";
  }
  return "document";
}

function guessMimeType(
  type: string,
  fileName?: string,
): string {
  const lower = (fileName ?? "").toLowerCase();
  if (type === "image") {
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".gif")) return "image/gif";
    if (lower.endsWith(".webp")) return "image/webp";
    return "image/jpeg";
  }
  if (type === "video") return "video/mp4";
  if (type === "voice" || type === "audio") {
    if (lower.endsWith(".mp3")) return "audio/mpeg";
    if (lower.endsWith(".wav")) return "audio/wav";
    if (lower.endsWith(".m4a")) return "audio/mp4";
    return "audio/ogg";
  }
  if (isAudioFileName(fileName)) {
    if (lower.endsWith(".mp3")) return "audio/mpeg";
    if (lower.endsWith(".wav")) return "audio/wav";
    if (lower.endsWith(".m4a")) return "audio/mp4";
    return "audio/ogg";
  }
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "application/octet-stream";
}

export function maxAttachmentPreview(
  attachments: MaxMessageAttachment[],
): string {
  const first = attachments.find(isMaxMediaAttachment);
  if (!first) return "📎 Вложение";
  return mediaPreviewLabel(
    mapMaxMediaType(first.type, first.filename),
    first.filename,
  );
}

function needsAuthHeader(url: string): boolean {
  return url.includes("oneme.ru");
}

async function fetchMaxMessageAttachments(
  messageId: string,
): Promise<MaxMessageAttachment[] | undefined> {
  const token = getMaxBotToken();
  if (!token) return undefined;

  try {
    const response = await fetch(
      `${getMaxApiBase()}/messages/${encodeURIComponent(messageId)}`,
      {
        headers: { Authorization: token },
        cache: "no-store",
      },
    );
    if (!response.ok) return undefined;

    const data = (await response.json()) as {
      message?: { body?: { attachments?: MaxMessageAttachment[] } };
      body?: { attachments?: MaxMessageAttachment[] };
    };

    return (
      data.message?.body?.attachments ??
      data.body?.attachments ??
      undefined
    );
  } catch (error) {
    console.error("[max-media] fetch message attachments failed:", error);
    return undefined;
  }
}

function resolveAttachmentUrl(
  attachment: MaxMessageAttachment,
  resolved?: MaxMessageAttachment,
): string | undefined {
  return (
    attachment.payload?.url ??
    resolved?.payload?.url ??
    undefined
  );
}

export async function downloadMaxAttachments(
  attachments: MaxMessageAttachment[] | undefined,
  options?: { messageId?: string },
): Promise<IncomingAttachmentPayload[]> {
  if (!attachments?.length) return [];

  const token = getMaxBotToken();
  let resolvedAttachments: MaxMessageAttachment[] | undefined;

  const needsResolve = attachments.some(
    (attachment) =>
      isMaxMediaAttachment(attachment) && !attachment.payload?.url,
  );
  if (needsResolve && options?.messageId) {
    resolvedAttachments = await fetchMaxMessageAttachments(options.messageId);
  }

  const results: IncomingAttachmentPayload[] = [];

  for (const attachment of attachments) {
    if (!isMaxMediaAttachment(attachment)) continue;

    const resolved = resolvedAttachments?.find(
      (item) =>
        item.type === attachment.type &&
        (item.payload?.token === attachment.payload?.token ||
          item.filename === attachment.filename),
    );

    const url = resolveAttachmentUrl(attachment, resolved);
    if (!url) continue;

    try {
      const headers: HeadersInit = {};
      if (token && needsAuthHeader(url)) {
        headers.Authorization = token;
      }

      const response = await fetch(url, { cache: "no-store", headers });
      if (!response.ok) continue;

      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length) continue;

      const mimeType =
        response.headers.get("content-type")?.split(";")[0]?.trim() ||
        guessMimeType(attachment.type, attachment.filename);

      results.push({
        type: mapMaxMediaType(
          attachment.type,
          attachment.filename,
          mimeType,
        ),
        mimeType,
        fileName: attachment.filename,
        fileSize: attachment.size ?? buffer.length,
        buffer,
      });
    } catch (error) {
      console.error("[max-media] download failed:", error);
    }
  }

  return results;
}
