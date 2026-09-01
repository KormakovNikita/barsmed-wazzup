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
}

const MEDIA_TYPES = new Set(["image", "video", "audio", "file"]);

export function isMaxMediaAttachment(
  attachment: MaxMessageAttachment,
): boolean {
  return MEDIA_TYPES.has(attachment.type);
}

function mapMaxMediaType(type: string): MessageMediaType {
  switch (type) {
    case "image":
      return "image";
    case "video":
      return "video";
    case "audio":
      return "audio";
    default:
      return "document";
  }
}

function guessMimeType(type: string, fileName?: string): string {
  const lower = (fileName ?? "").toLowerCase();
  if (type === "image") {
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".gif")) return "image/gif";
    if (lower.endsWith(".webp")) return "image/webp";
    return "image/jpeg";
  }
  if (type === "video") return "video/mp4";
  if (type === "audio") return "audio/mpeg";
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
  return mediaPreviewLabel(mapMaxMediaType(first.type), first.filename);
}

export async function downloadMaxAttachments(
  attachments: MaxMessageAttachment[] | undefined,
): Promise<IncomingAttachmentPayload[]> {
  if (!attachments?.length) return [];

  const results: IncomingAttachmentPayload[] = [];

  for (const attachment of attachments) {
    if (!isMaxMediaAttachment(attachment)) continue;
    const url = attachment.payload?.url;
    if (!url) continue;

    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) continue;

      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length) continue;

      const mimeType =
        response.headers.get("content-type")?.split(";")[0]?.trim() ||
        guessMimeType(attachment.type, attachment.filename);

      results.push({
        type: mapMaxMediaType(attachment.type),
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
