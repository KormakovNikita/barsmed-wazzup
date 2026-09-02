import type { proto, WASocket, WAMessage } from "@whiskeysockets/baileys";
import {
  downloadMediaMessage,
  getContentType,
  isJidGroup,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { mediaPreviewLabel } from "@/lib/media-storage";
import { processIncomingMessage } from "@/lib/store";
import type { IncomingAttachmentPayload, MessageMediaType } from "@/lib/types";
import {
  formatWhatsAppPhoneDisplay,
  jidToPhone,
} from "@/lib/integrations/whatsapp/phone";

const mediaLogger = pino({ level: "silent" });
const processedMessageIds = new Set<string>();

function rememberProcessed(messageId: string): boolean {
  if (processedMessageIds.has(messageId)) return true;
  processedMessageIds.add(messageId);
  if (processedMessageIds.size > 5000) {
    const first = processedMessageIds.values().next().value;
    if (first) processedMessageIds.delete(first);
  }
  return false;
}

function mapMediaType(contentType: keyof proto.IMessage): MessageMediaType {
  switch (contentType) {
    case "imageMessage":
      return "image";
    case "videoMessage":
      return "video";
    case "audioMessage":
      return "audio";
    case "documentMessage":
      return "document";
    case "stickerMessage":
      return "sticker";
    default:
      return "document";
  }
}

async function extractAttachments(
  sock: WASocket,
  message: WAMessage,
  contentType: keyof proto.IMessage,
): Promise<IncomingAttachmentPayload[] | undefined> {
  if (
    contentType !== "imageMessage" &&
    contentType !== "videoMessage" &&
    contentType !== "audioMessage" &&
    contentType !== "documentMessage" &&
    contentType !== "stickerMessage"
  ) {
    return undefined;
  }

  try {
    const buffer = (await downloadMediaMessage(
      message,
      "buffer",
      {},
      { reuploadRequest: sock.updateMediaMessage, logger: mediaLogger },
    )) as Buffer;

    if (!buffer?.length) return undefined;

    const inner = message.message?.[contentType] as
      | { mimetype?: string; fileName?: string; ptt?: boolean }
      | undefined;
    const mimeType = inner?.mimetype ?? "application/octet-stream";
    let mediaType = mapMediaType(contentType);
    if (contentType === "audioMessage" && inner?.ptt) {
      mediaType = "voice";
    }

    return [
      {
        type: mediaType,
        mimeType,
        fileName: inner?.fileName,
        fileSize: buffer.length,
        buffer,
      },
    ];
  } catch (error) {
    console.error("[whatsapp] media download failed:", error);
    return undefined;
  }
}

function extractText(message: WAMessage): string {
  const content = message.message;
  if (!content) return "";

  if (content.conversation) return content.conversation.trim();
  if (content.extendedTextMessage?.text) {
    return content.extendedTextMessage.text.trim();
  }
  if (content.imageMessage?.caption) return content.imageMessage.caption.trim();
  if (content.videoMessage?.caption) return content.videoMessage.caption.trim();
  if (content.documentMessage?.caption) {
    return content.documentMessage.caption.trim();
  }

  return "";
}

function getReplyToId(message: WAMessage): string | undefined {
  const ctx =
    message.message?.extendedTextMessage?.contextInfo ??
    message.message?.imageMessage?.contextInfo ??
    message.message?.videoMessage?.contextInfo ??
    message.message?.documentMessage?.contextInfo ??
    message.message?.audioMessage?.contextInfo;

  if (ctx?.stanzaId) return ctx.stanzaId;
  return undefined;
}

async function handleWhatsAppMessage(
  sock: WASocket,
  message: WAMessage,
): Promise<void> {
  if (!message.message || message.key.remoteJid === "status@broadcast") return;
  if (isJidGroup(message.key.remoteJid ?? undefined)) return;

  const messageId = message.key.id;
  if (!messageId || rememberProcessed(messageId)) return;

  const phone = jidToPhone(message.key.remoteJid);
  if (!phone) return;

  const contentType = getContentType(message.message);
  if (!contentType) return;

  if (contentType === "protocolMessage" || contentType === "reactionMessage") {
    return;
  }

  let text = extractText(message);
  const attachments = await extractAttachments(sock, message, contentType);

  if (!text && attachments?.length) {
    text = mediaPreviewLabel(attachments[0].type, attachments[0].fileName);
  } else if (!text && contentType === "audioMessage") {
    text = mediaPreviewLabel("voice");
  } else if (!text && contentType === "imageMessage") {
    text = mediaPreviewLabel("image");
  } else if (!text && contentType === "videoMessage") {
    text = mediaPreviewLabel("video");
  } else if (!text && contentType === "documentMessage") {
    text = mediaPreviewLabel("document");
  }

  if (!text && !attachments?.length) return;

  const pushName = message.pushName?.trim();
  const senderName =
    pushName || formatWhatsAppPhoneDisplay(phone);

  processIncomingMessage({
    channel: "whatsapp",
    externalThreadId: phone,
    externalMessageId: `wa-${messageId}`,
    channelMessageId: messageId,
    content: text,
    senderName,
    direction: message.key.fromMe ? "out" : "in",
    replyToChannelMessageId: getReplyToId(message),
    attachments,
  });
}

export function attachWhatsAppMessageHandler(sock: WASocket): void {
  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify") return;
    for (const message of messages) {
      handleWhatsAppMessage(sock, message).catch((error) => {
        console.error("[whatsapp] message handler failed:", error);
      });
    }
  });
}
