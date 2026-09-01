import { parseMaxUpdate, type MaxUpdate } from "@/lib/integrations/max";
import {
  downloadMaxAttachments,
  maxAttachmentPreview,
} from "@/lib/integrations/max-media";
import { processIncomingMessage } from "@/lib/store";

export async function processMaxIncomingUpdate(
  update: MaxUpdate,
): Promise<{ conversationId: string; created: boolean } | null> {
  const parsed = parseMaxUpdate(update);
  if (!parsed) return null;

  const rawAttachments = update.message?.body?.attachments;
  const messageMid =
    update.message?.body?.mid ??
    parsed.channelMessageId ??
    parsed.externalMessageId.replace(/^max-/, "");

  const attachments = await downloadMaxAttachments(rawAttachments, {
    messageId: messageMid,
  });

  let content = parsed.content;
  if (!content.trim() && rawAttachments?.length) {
    content = maxAttachmentPreview(rawAttachments);
  }
  if (!content.trim()) return null;

  const hasMediaOnly =
    !parsed.content.trim() &&
    Boolean(rawAttachments?.some((attachment) => attachment.type === "audio" || attachment.type === "voice"));

  const result = processIncomingMessage({
    channel: "max",
    externalThreadId: parsed.externalThreadId,
    externalMessageId: parsed.externalMessageId,
    channelMessageId:
      parsed.channelMessageId ??
      parsed.externalMessageId.replace(/^max-/, ""),
    replyToChannelMessageId: parsed.replyToChannelMessageId,
    content,
    senderName: parsed.senderName,
    senderUsername: parsed.senderUsername,
    maxChatId: parsed.maxChatId,
    maxUserId: parsed.maxUserId,
    direction: parsed.direction,
    attachments: attachments.length ? attachments : undefined,
  });

  if (!result && hasMediaOnly && rawAttachments?.length) {
    const fallback = processIncomingMessage({
      channel: "max",
      externalThreadId: parsed.externalThreadId,
      externalMessageId: parsed.externalMessageId,
      channelMessageId:
        parsed.channelMessageId ??
        parsed.externalMessageId.replace(/^max-/, ""),
      replyToChannelMessageId: parsed.replyToChannelMessageId,
      content: maxAttachmentPreview(rawAttachments),
      senderName: parsed.senderName,
      senderUsername: parsed.senderUsername,
      maxChatId: parsed.maxChatId,
      maxUserId: parsed.maxUserId,
      direction: parsed.direction,
    });
    if (fallback) {
      return {
        conversationId: fallback.conversation.id,
        created: fallback.created,
      };
    }
  }

  if (!result) return null;

  return {
    conversationId: result.conversation.id,
    created: result.created,
  };
}
