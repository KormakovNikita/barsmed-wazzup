import { parseMaxUpdate, type MaxUpdate } from "@/lib/integrations/max";
import {
  downloadMaxAttachments,
  maxAttachmentPreview,
} from "@/lib/integrations/max-media";
import {
  sendMaxVoiceUnsupportedNotice,
  updateHasMaxVoice,
} from "@/lib/integrations/max-voice-notice";
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

  if (!result) return null;

  if (
    result.created &&
    parsed.direction !== "out" &&
    updateHasMaxVoice(update)
  ) {
    await sendMaxVoiceUnsupportedNotice({
      conversationId: result.conversation.id,
      channelMessageId: parsed.channelMessageId,
    });
  }

  return {
    conversationId: result.conversation.id,
    created: result.created,
  };
}
