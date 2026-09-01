import { readFileSync, unlinkSync } from "fs";
import { extFromAttachType } from "webmaxsocket";
import type { WebMaxAttachment, WebMaxMessage } from "webmaxsocket";
import { mediaPreviewLabel } from "@/lib/media-storage";
import type {
  IncomingAttachmentPayload,
  MessageMediaType,
} from "@/lib/types";

function mapAttachType(
  attachType: string,
  contentType: string,
  fileName?: string,
): MessageMediaType {
  const upper = attachType.toUpperCase();
  if (upper === "PHOTO" || upper === "IMAGE") return "image";
  if (upper === "VIDEO") return "video";
  if (upper === "VOICE" || upper === "AUDIO") return "voice";
  if (upper === "STICKER") return "sticker";
  if (upper === "FILE") {
    const lower = (fileName ?? "").toLowerCase();
    if (/\.(ogg|opus|oga)$/.test(lower)) return "voice";
    if (/\.(mp3|wav|m4a|aac)$/.test(lower)) return "audio";
    if (/\.(jpe?g|png|gif|webp)$/.test(lower)) return "image";
    if (/\.(mp4|webm|mov)$/.test(lower)) return "video";
    return "document";
  }
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) {
    return contentType.includes("ogg") ? "voice" : "audio";
  }
  return "document";
}

function guessFileName(
  attach: WebMaxAttachment,
  contentType: string,
  attachType: string,
): string | undefined {
  const explicit =
    attach.name ?? attach.fileName ?? attach.filename ?? undefined;
  if (explicit) return explicit;

  const ext =
    extFromAttachType(attachType) ||
    (contentType.includes("mpeg")
      ? ".mp3"
      : contentType.includes("ogg")
        ? ".ogg"
        : contentType.includes("jpeg")
          ? ".jpg"
          : contentType.includes("png")
            ? ".png"
            : contentType.includes("mp4")
              ? ".mp4"
              : ".bin");

  return `max-${attachType.toLowerCase()}${ext.startsWith(".") ? ext : `.${ext}`}`;
}

export function inspectMaxUserAttachment(
  attach: WebMaxAttachment,
): { type: MessageMediaType; fileName?: string } | null {
  const attachType = String(attach._type ?? attach.type ?? "").toUpperCase();
  if (!attachType || attachType === "CALL" || attachType === "INLINE_KEYBOARD") {
    return null;
  }
  const fileName = attach.name ?? attach.fileName ?? attach.filename;
  return {
    type: mapAttachType(attachType, "", fileName),
    fileName,
  };
}

export function maxUserAttachmentPreview(
  attachments: WebMaxAttachment[],
): string {
  const first = attachments
    .map((attachment) => inspectMaxUserAttachment(attachment))
    .find(Boolean);
  if (!first) return "📎 Вложение";
  return mediaPreviewLabel(first.type, first.fileName);
}

export async function extractMaxUserMedia(
  message: WebMaxMessage,
): Promise<IncomingAttachmentPayload[]> {
  if (!message.attachments?.length) return [];

  const results: IncomingAttachmentPayload[] = [];

  for (let index = 0; index < message.attachments.length; index += 1) {
    const attach = message.attachments[index];
    const attachType = String(attach._type ?? attach.type ?? "").toUpperCase();
    if (!attachType || attachType === "CALL") continue;

    try {
      const { path, contentType } = await message.downloadAttachment(index);
      const buffer = readFileSync(path);
      try {
        unlinkSync(path);
      } catch {
        // ignore temp cleanup errors
      }

      if (!buffer.length) continue;

      const fileName = guessFileName(attach, contentType, attachType);
      const type = mapAttachType(attachType, contentType, fileName);

      results.push({
        type,
        mimeType: contentType || "application/octet-stream",
        fileName,
        fileSize: buffer.length,
        buffer,
      });
    } catch (error) {
      console.error("[max-user] attachment download failed:", error);
      const info = inspectMaxUserAttachment(attach);
      if (info) {
        console.info(
          `[max-user] keeping preview for ${info.type}: ${info.fileName ?? attachType}`,
        );
      }
    }
  }

  return results;
}
