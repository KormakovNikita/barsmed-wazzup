import type { proto, WASocket, WAMessage } from "@whiskeysockets/baileys";
import {
  downloadMediaMessage,
  getContentType,
  isJidGroup,
  isLidUser,
  jidDecode,
  WAMessageStatus,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { mediaPreviewLabel } from "@/lib/media-storage";
import {
  processIncomingMessage,
  updateWhatsAppMessageDeliveryStatus,
} from "@/lib/store";
import type { IncomingAttachmentPayload, MessageMediaType } from "@/lib/types";
import {
  formatWhatsAppPhoneDisplay,
  isWhatsAppPhoneIdentifier,
  normalizeWhatsAppPhone,
} from "@/lib/integrations/whatsapp/phone";
import {
  resolveInboundWhatsAppThreadId,
} from "@/lib/integrations/whatsapp/lid";
import { mergeWhatsAppConversationThreads } from "@/lib/store";

import { getWhatsAppMediaDownloadOptions } from "@/lib/integrations/whatsapp/proxy";

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
      getWhatsAppMediaDownloadOptions(),
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

function messageTimestampToIso(message: WAMessage): string | undefined {
  const raw = message.messageTimestamp;
  if (raw == null) return undefined;

  const seconds =
    typeof raw === "object" && raw !== null && "toNumber" in raw
      ? (raw as { toNumber: () => number }).toNumber()
      : Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;

  return new Date(seconds * 1000).toISOString();
}

async function handleWhatsAppMessage(
  sock: WASocket,
  message: WAMessage,
): Promise<void> {
  if (!message.message || message.key.remoteJid === "status@broadcast") return;
  if (isJidGroup(message.key.remoteJid ?? undefined)) return;

  const messageId = message.key.id;
  if (!messageId || rememberProcessed(messageId)) return;

  const resolved = await resolveInboundWhatsAppThreadId(
    sock,
    message.key.remoteJid,
  );
  if (!resolved?.threadId) return;

  const { threadId: phone } = resolved;

  if (
    isWhatsAppPhoneIdentifier(phone) &&
    message.key.remoteJid &&
    isLidUser(message.key.remoteJid)
  ) {
    const lid = jidDecode(message.key.remoteJid)?.user;
    if (lid) {
      mergeWhatsAppConversationThreads(lid, phone);
    }
  }

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
    createdAt: messageTimestampToIso(message),
  });
}

function mapWhatsAppDeliveryStatus(
  status: proto.WebMessageInfo.Status | null | undefined,
): "sent" | "delivered" | "read" | "failed" | null {
  if (status == null) return null;
  if (status === WAMessageStatus.ERROR) return "failed";
  if (status === WAMessageStatus.READ || status === WAMessageStatus.PLAYED) {
    return "read";
  }
  if (status === WAMessageStatus.DELIVERY_ACK) return "delivered";
  if (
    status === WAMessageStatus.SERVER_ACK ||
    status === WAMessageStatus.PENDING
  ) {
    return "sent";
  }
  return null;
}

export function attachWhatsAppMessageHandler(sock: WASocket): void {
  sock.ev.on("lid-mapping.update", (mapping) => {
    const lid = mapping.lid?.replace(/\D/g, "") ?? "";
    const pnUser = mapping.pn?.split("@")[0]?.replace(/\D/g, "") ?? "";
    const phone = pnUser ? normalizeWhatsAppPhone(pnUser) : "";
    if (lid && phone) {
      mergeWhatsAppConversationThreads(lid, phone);
    }
  });

  sock.ev.on("messages.update", (updates) => {
    for (const { key, update } of updates) {
      if (!key.fromMe || !key.id || update.status == null) continue;
      const mapped = mapWhatsAppDeliveryStatus(update.status);
      if (!mapped) continue;
      updateWhatsAppMessageDeliveryStatus(key.id, mapped);
    }
  });

  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify" && type !== "append") return;
    for (const message of messages) {
      handleWhatsAppMessage(sock, message).catch((error) => {
        console.error("[whatsapp] message handler failed:", error);
      });
    }
  });
}
