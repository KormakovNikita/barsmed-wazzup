import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  extensionForMime,
  guessMimeFromFileName,
} from "@/lib/media-storage";
import type { MessageMediaType } from "@/lib/types";

const TEMPLATE_MEDIA_ROOT = path.join(process.cwd(), ".data", "media", "templates");

export function ensureTemplateMediaDir(templateId: string): string {
  const dir = path.join(TEMPLATE_MEDIA_ROOT, templateId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function saveTemplateMediaBuffer(params: {
  templateId: string;
  buffer: Buffer;
  mimeType: string;
  fileName?: string;
}): { attachmentId: string; storagePath: string } {
  const attachmentId = `tpl-att-${crypto.randomUUID()}`;
  const dir = ensureTemplateMediaDir(params.templateId);
  const ext =
    path.extname(params.fileName ?? "") ||
    extensionForMime(params.mimeType) ||
    ".bin";
  const storagePath = path.join(dir, `${attachmentId}${ext}`);
  fs.writeFileSync(storagePath, params.buffer);
  return { attachmentId, storagePath };
}

export function readTemplateMediaFile(storagePath: string): Buffer | null {
  if (!fs.existsSync(storagePath)) return null;
  return fs.readFileSync(storagePath);
}

export function deleteTemplateMediaFile(storagePath: string): void {
  if (fs.existsSync(storagePath)) {
    fs.unlinkSync(storagePath);
  }
}

export function templateAttachmentPublicUrl(attachmentId: string): string {
  return `/api/templates/attachments/${attachmentId}`;
}

export function mediaTypeFromTemplateFile(
  mimeType: string,
  fileName?: string,
): MessageMediaType {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) {
    return mimeType.includes("ogg") || fileName?.endsWith(".ogg")
      ? "voice"
      : "audio";
  }
  return "document";
}

export function resolveTemplateFileMeta(file: File): {
  mimeType: string;
  type: MessageMediaType;
} {
  const mimeType = file.type || guessMimeFromFileName(file.name);
  return {
    mimeType,
    type: mediaTypeFromTemplateFile(mimeType, file.name),
  };
}
