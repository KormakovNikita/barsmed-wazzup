import type { WebMaxMessage } from "webmaxsocket";
import { mediaPreviewLabel } from "@/lib/media-storage";
import { processIncomingMessage } from "@/lib/store";
import {
  extractMaxUserMedia,
  inspectMaxUserAttachment,
  maxUserAttachmentPreview,
} from "./media";

function formatSenderName(message: WebMaxMessage): string {
  if (message.sender) {
    const full = [
      message.sender.firstname,
      message.sender.lastname,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
    return full || message.sender.username || message.getSenderName();
  }
  return message.getSenderName();
}

function getReplyToChannelMessageId(
  message: WebMaxMessage,
): string | undefined {
  if (message.replyTo == null) return undefined;
  return String(message.replyTo);
}

export async function processMaxUserMessage(
  message: WebMaxMessage,
  ownUserId?: number | null,
): Promise<{ conversationId: string; created: boolean } | null> {
  if (!message || message.chatId == null) return null;

  if (ownUserId != null && message.senderId === ownUserId) {
    return null;
  }

  const threadId = String(message.chatId);
  const senderName = formatSenderName(message);
  const senderUsername = message.sender?.username ?? undefined;
  const messageId = String(message.id);
  const text = (message.text ?? "").trim();

  let attachments: import("@/lib/types").IncomingAttachmentPayload[] | undefined;
  try {
    const media = await extractMaxUserMedia(message);
    attachments = media.length ? media : undefined;
  } catch (error) {
    console.error("[max-user] media extraction failed:", error);
  }

  const previewFromMeta = message.attachments
    ?.map((item) => inspectMaxUserAttachment(item))
    .find(Boolean);

  const content =
    text ||
    (attachments?.length
      ? mediaPreviewLabel(attachments[0].type, attachments[0].fileName)
      : previewFromMeta
        ? mediaPreviewLabel(previewFromMeta.type, previewFromMeta.fileName)
        : message.attachments?.length
          ? maxUserAttachmentPreview(message.attachments)
          : "");

  if (!content && !attachments?.length) return null;

  const result = processIncomingMessage({
    channel: "max",
    externalThreadId: threadId,
    externalMessageId: `max-user-${messageId}`,
    channelMessageId: messageId,
    replyToChannelMessageId: getReplyToChannelMessageId(message),
    content,
    senderName,
    senderUsername,
    maxChatId: threadId,
    maxUserId: String(message.senderId),
    direction: "in",
    attachments,
  });

  if (!result) return null;

  console.info(
    `[max-user] processed message from ${senderName} (${threadId}): ${content.slice(0, 80)}`,
  );

  return {
    conversationId: result.conversation.id,
    created: result.created,
  };
}
