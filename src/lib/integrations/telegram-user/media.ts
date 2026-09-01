import { Api } from "teleproto/tl";
import type { TelegramClient } from "teleproto";
import type { CustomMessage } from "teleproto/tl/custom/message";
import type {
  IncomingAttachmentPayload,
  MessageMediaType,
} from "@/lib/types";

type IncomingTelegramMessage = CustomMessage | Api.Message;

export interface TelegramMediaInfo {
  type: MessageMediaType;
  mimeType: string;
  fileName?: string;
  fileSize?: number;
  width?: number;
  height?: number;
}

function detectMediaType(
  media: Api.TypeMessageMedia,
  fileName?: string,
): MessageMediaType {
  if (media instanceof Api.MessageMediaPhoto) return "image";
  if (media instanceof Api.MessageMediaDocument) {
    const doc = media.document;
    if (doc instanceof Api.Document) {
      for (const attr of doc.attributes) {
        if (attr instanceof Api.DocumentAttributeVideo) {
          return attr.roundMessage ? "voice" : "video";
        }
        if (attr instanceof Api.DocumentAttributeAudio) {
          return attr.voice ? "voice" : "audio";
        }
        if (attr instanceof Api.DocumentAttributeSticker) {
          return "sticker";
        }
      }
      const mime = doc.mimeType ?? "";
      if (mime.startsWith("image/")) return "image";
      if (mime.startsWith("video/")) return "video";
      if (mime.startsWith("audio/")) return "audio";
      if (mime === "audio/ogg" || mime === "application/ogg") return "voice";
    }
    return "document";
  }
  if (fileName) {
    const lower = fileName.toLowerCase();
    if (/\.(jpe?g|png|gif|webp)$/.test(lower)) return "image";
    if (/\.(mp4|webm|mov)$/.test(lower)) return "video";
    if (/\.(ogg|opus)$/.test(lower)) return "voice";
    if (/\.(mp3|wav|m4a)$/.test(lower)) return "audio";
  }
  return "document";
}

function extractFileName(media: Api.TypeMessageMedia): string | undefined {
  if (!(media instanceof Api.MessageMediaDocument)) return undefined;
  const doc = media.document;
  if (!(doc instanceof Api.Document)) return undefined;
  for (const attr of doc.attributes) {
    if (attr instanceof Api.DocumentAttributeFilename) {
      return attr.fileName;
    }
  }
  return undefined;
}

function extractFileSize(media: Api.TypeMessageMedia): number | undefined {
  if (media instanceof Api.MessageMediaPhoto) {
    const sizes = media.photo;
    if (sizes instanceof Api.Photo && sizes.sizes.length) {
      const largest = sizes.sizes[sizes.sizes.length - 1];
      if ("size" in largest) return largest.size;
    }
  }
  if (media instanceof Api.MessageMediaDocument) {
    const doc = media.document;
    if (doc instanceof Api.Document) return Number(doc.size);
  }
  return undefined;
}

function extractDimensions(
  media: Api.TypeMessageMedia,
): { width?: number; height?: number } {
  if (media instanceof Api.MessageMediaPhoto) {
    const photo = media.photo;
    if (photo instanceof Api.Photo && photo.sizes.length) {
      for (const size of [...photo.sizes].reverse()) {
        if (size instanceof Api.PhotoSize) {
          return { width: size.w, height: size.h };
        }
      }
    }
  }
  if (media instanceof Api.MessageMediaDocument) {
    const doc = media.document;
    if (doc instanceof Api.Document) {
      for (const attr of doc.attributes) {
        if (attr instanceof Api.DocumentAttributeVideo) {
          return { width: attr.w, height: attr.h };
        }
        if (attr instanceof Api.DocumentAttributeImageSize) {
          return { width: attr.w, height: attr.h };
        }
      }
    }
  }
  return {};
}

function guessMimeFromMedia(
  media: Api.TypeMessageMedia,
  fileName?: string,
  type?: MessageMediaType,
): string {
  if (media instanceof Api.MessageMediaDocument) {
    const doc = media.document;
    if (doc instanceof Api.Document && doc.mimeType) return doc.mimeType;
  }
  if (media instanceof Api.MessageMediaPhoto) return "image/jpeg";
  if (type === "voice") return "audio/ogg";
  if (fileName) {
    const lower = fileName.toLowerCase();
    if (/\.(jpe?g)$/.test(lower)) return "image/jpeg";
    if (/\.png$/.test(lower)) return "image/png";
    if (/\.gif$/.test(lower)) return "image/gif";
    if (/\.webp$/.test(lower)) return "image/webp";
    if (/\.mp4$/.test(lower)) return "video/mp4";
    if (/\.mp3$/.test(lower)) return "audio/mpeg";
    if (/\.ogg$/.test(lower)) return "audio/ogg";
    if (/\.opus$/.test(lower)) return "audio/opus";
    if (/\.pdf$/.test(lower)) return "application/pdf";
  }
  return "application/octet-stream";
}

export function inspectTelegramMedia(
  message: IncomingTelegramMessage,
): TelegramMediaInfo | null {
  if (!("media" in message) || !message.media) return null;
  if (message.media instanceof Api.MessageMediaEmpty) return null;
  if (message.media instanceof Api.MessageMediaWebPage) return null;

  const fileName = extractFileName(message.media);
  const type = detectMediaType(message.media, fileName);
  const mimeType = guessMimeFromMedia(message.media, fileName, type);
  const fileSize = extractFileSize(message.media);
  const dims = extractDimensions(message.media);

  return {
    type,
    mimeType,
    fileName,
    fileSize,
    width: dims.width,
    height: dims.height,
  };
}

async function downloadTelegramMediaBuffer(
  message: IncomingTelegramMessage,
  client?: TelegramClient | null,
): Promise<Buffer | null> {
  if ("downloadMedia" in message && typeof message.downloadMedia === "function") {
    try {
      const downloaded = await message.downloadMedia({});
      if (downloaded) {
        const buffer = Buffer.isBuffer(downloaded)
          ? downloaded
          : Buffer.from(String(downloaded));
        if (buffer.length) return buffer;
      }
    } catch (error) {
      console.error("[telegram-user] message.downloadMedia failed:", error);
    }
  }

  if (client && "media" in message && message.media) {
    try {
      const downloaded = await client.downloadMedia(
        message as Parameters<TelegramClient["downloadMedia"]>[0],
        {},
      );
      if (downloaded) {
        const buffer = Buffer.isBuffer(downloaded)
          ? downloaded
          : Buffer.from(String(downloaded));
        if (buffer.length) return buffer;
      }
    } catch (error) {
      console.error("[telegram-user] client.downloadMedia failed:", error);
    }
  }

  return null;
}

export async function extractTelegramMedia(
  message: IncomingTelegramMessage,
  client?: TelegramClient | null,
): Promise<IncomingAttachmentPayload | null> {
  const info = inspectTelegramMedia(message);
  if (!info) return null;

  const buffer = await downloadTelegramMediaBuffer(message, client);
  if (!buffer) return null;

  return {
    type: info.type,
    mimeType: info.mimeType,
    fileName: info.fileName,
    fileSize: info.fileSize ?? buffer.length,
    buffer,
    width: info.width,
    height: info.height,
  };
}

export function mediaTypeFromFile(
  mimeType: string,
  fileName?: string,
): MessageMediaType {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  const lower = (fileName ?? "").toLowerCase();
  if (/\.(jpe?g|png|gif|webp)$/.test(lower)) return "image";
  if (/\.(mp4|webm|mov)$/.test(lower)) return "video";
  if (/\.(ogg|opus)$/.test(lower)) return "voice";
  if (/\.(mp3|wav|m4a)$/.test(lower)) return "audio";
  return "document";
}
