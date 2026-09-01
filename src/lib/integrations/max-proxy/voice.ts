import { readFileSync, unlinkSync } from "fs";
import {
  downloadUrlToTempFile,
  Opcode,
  type MaxProxyAttachment,
  type MaxProxyMessage,
  type WebMaxClient,
} from "webmaxsocket";

function attachmentType(attachment: MaxProxyAttachment): string {
  return String(attachment._type ?? attachment.type ?? "").toUpperCase();
}

export function isVoiceAttachment(attachment: MaxProxyAttachment): boolean {
  const type = attachmentType(attachment);
  if (type === "AUDIO" || type === "VOICE") return true;
  if (type === "UNSUPPORTED" && (attachment.audioId || attachment.token)) {
    return true;
  }
  return false;
}

export function findVoiceAttachmentIndex(message: MaxProxyMessage): number {
  return message.attachments.findIndex(isVoiceAttachment);
}

function pickPlaybackUrl(payload: Record<string, unknown> | undefined): string | null {
  if (!payload) return null;
  const candidates = [
    payload.url,
    payload.MP4_720,
    payload.MP4_480,
    payload.MP4_360,
    payload.MP3,
    payload.c,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.startsWith("http")) {
      return value;
    }
  }
  if (payload.urls && typeof payload.urls === "object") {
    const urls = payload.urls as Record<string, unknown>;
    for (const value of Object.values(urls)) {
      if (typeof value === "string" && value.startsWith("http")) {
        return value;
      }
    }
  }
  return null;
}

async function downloadFromUrl(url: string): Promise<{
  buffer: Buffer;
  mimeType: string;
}> {
  const downloaded = await downloadUrlToTempFile(url, {
    extFallback: ".ogg",
  });
  try {
    const buffer = readFileSync(downloaded.path);
    return {
      buffer,
      mimeType: downloaded.contentType || "audio/ogg",
    };
  } finally {
    try {
      unlinkSync(downloaded.path);
    } catch {
      // ignore temp cleanup errors
    }
  }
}

export async function downloadVoiceFromMessage(
  client: WebMaxClient,
  message: MaxProxyMessage,
  attachmentIndex: number,
): Promise<{ buffer: Buffer; mimeType: string; fileName: string } | null> {
  const attachment = message.attachments[attachmentIndex];
  if (!attachment) return null;

  const directUrl = attachment.baseUrl ?? attachment.url;
  if (directUrl) {
    const downloaded = await downloadFromUrl(directUrl);
    return {
      ...downloaded,
      fileName: `voice-${message.id ?? Date.now()}.ogg`,
    };
  }

  const type = attachmentType(attachment);
  if (
    type === "UNSUPPORTED" &&
    attachment.audioId != null &&
    attachment.token &&
    message.chatId != null &&
    message.id != null
  ) {
    try {
      const response = await client.sendAndWait(Opcode.VIDEO_PLAY, {
        videoId: attachment.audioId,
        token: attachment.token,
        chatId: message.chatId,
        messageId: message.id,
      });
      const playbackUrl = pickPlaybackUrl(response.payload);
      if (playbackUrl) {
        const downloaded = await downloadFromUrl(playbackUrl);
        return {
          ...downloaded,
          fileName: `voice-${message.id}.mp3`,
        };
      }
    } catch (error) {
      console.error("[max-proxy] VIDEO_PLAY voice download failed:", error);
    }
  }

  if (
    type === "FILE" &&
    attachment.fileId != null &&
    message.chatId != null &&
    message.id != null
  ) {
    try {
      const fileUrl = await client.requestFileDownloadUrl({
        chatId: message.chatId,
        messageId: message.id,
        fileId: attachment.fileId,
        fileName: attachment.name ?? attachment.fileName ?? "voice.ogg",
      });
      const downloaded = await downloadFromUrl(fileUrl);
      return {
        ...downloaded,
        fileName: attachment.name ?? attachment.fileName ?? `voice-${message.id}.ogg`,
      };
    } catch (error) {
      console.error("[max-proxy] FILE download failed:", error);
    }
  }

  try {
    const downloaded = await message.downloadAttachment(attachmentIndex, {
      filename: `voice-${message.id ?? Date.now()}`,
    });
    const buffer = readFileSync(downloaded.path);
    try {
      unlinkSync(downloaded.path);
    } catch {
      // ignore
    }
    return {
      buffer,
      mimeType: downloaded.contentType || "audio/ogg",
      fileName: `voice-${message.id ?? Date.now()}.ogg`,
    };
  } catch (error) {
    console.error("[max-proxy] downloadAttachment failed:", error);
    return null;
  }
}
