import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { MessageAttachment, MessageMediaType } from "@/lib/types";

const MEDIA_ROOT = path.join(process.cwd(), ".data", "media");

export function ensureMediaDir(conversationId: string): string {
  const dir = path.join(MEDIA_ROOT, conversationId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function extensionForMime(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/opus": ".opus",
    "application/pdf": ".pdf",
  };
  return map[mimeType] ?? "";
}

export function guessMimeFromFileName(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".opus": "audio/opus",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return map[ext] ?? "application/octet-stream";
}

export function mediaPreviewLabel(type: MessageMediaType, fileName?: string): string {
  switch (type) {
    case "image":
      return "📷 Фото";
    case "video":
      return "🎬 Видео";
    case "audio":
      return "🎵 Аудио";
    case "voice":
      return "🎤 Голосовое";
    case "sticker":
      return "🙂 Стикер";
    case "document":
      return fileName ? `📎 ${fileName}` : "📎 Файл";
    default:
      return "📎 Вложение";
  }
}

export function saveMediaBuffer(params: {
  conversationId: string;
  buffer: Buffer;
  mimeType: string;
  type: MessageMediaType;
  fileName?: string;
}): { attachmentId: string; storagePath: string } {
  const attachmentId = `att-${crypto.randomUUID()}`;
  const dir = ensureMediaDir(params.conversationId);
  const ext =
    path.extname(params.fileName ?? "") ||
    extensionForMime(params.mimeType) ||
    ".bin";
  const storagePath = path.join(dir, `${attachmentId}${ext}`);
  fs.writeFileSync(storagePath, params.buffer);
  return { attachmentId, storagePath };
}

export function saveMediaFile(params: {
  conversationId: string;
  sourcePath: string;
  mimeType: string;
  type: MessageMediaType;
  fileName?: string;
}): { attachmentId: string; storagePath: string } {
  const buffer = fs.readFileSync(params.sourcePath);
  return saveMediaBuffer({
    conversationId: params.conversationId,
    buffer,
    mimeType: params.mimeType,
    type: params.type,
    fileName: params.fileName,
  });
}

export function readMediaFile(storagePath: string): Buffer | null {
  if (!fs.existsSync(storagePath)) return null;
  return fs.readFileSync(storagePath);
}

export function deleteMediaFile(storagePath: string): void {
  if (fs.existsSync(storagePath)) {
    fs.unlinkSync(storagePath);
  }
  const thumb = `${storagePath}.thumb.jpg`;
  if (fs.existsSync(thumb)) {
    fs.unlinkSync(thumb);
  }
}

export function attachmentPublicUrl(attachmentId: string): string {
  return `/api/media/${attachmentId}`;
}

export function toMessageAttachment(params: {
  id: string;
  messageId: string;
  type: MessageMediaType;
  mimeType: string;
  storagePath: string;
  fileName?: string;
  fileSize?: number;
  width?: number;
  height?: number;
}): MessageAttachment {
  return {
    id: params.id,
    messageId: params.messageId,
    type: params.type,
    mimeType: params.mimeType,
    fileName: params.fileName,
    fileSize: params.fileSize,
    storagePath: params.storagePath,
    url: attachmentPublicUrl(params.id),
    width: params.width,
    height: params.height,
  };
}
