import { parseMaxUpdate, type MaxUpdate } from "@/lib/integrations/max";
import { downloadMaxAttachments, maxAttachmentPreview } from "@/lib/integrations/max-media";
import { processIncomingMessage } from "@/lib/store";

export async function processMaxIncomingUpdate(
  update: MaxUpdate,
): Promise<{ conversationId: string; created: boolean } | null> {
  const parsed = parseMaxUpdate(update);
  if (!parsed) return null;

  const rawAttachments = update.message?.body?.attachments;
  const attachments = await downloadMaxAttachments(rawAttachments);

  let content = parsed.content;
  if (!content.trim() && attachments.length) {
    content = maxAttachmentPreview(rawAttachments ?? []);
  } else if (!content.trim()) {
    return null;
  }

  const result = processIncomingMessage({
    channel: "max",
    externalThreadId: parsed.externalThreadId,
    externalMessageId: parsed.externalMessageId,
    channelMessageId: parsed.externalMessageId.replace(/^max-/, ""),
    content,
    senderName: parsed.senderName,
    senderUsername: parsed.senderUsername,
    maxChatId: parsed.maxChatId,
    maxUserId: parsed.maxUserId,
    direction: parsed.direction,
    attachments: attachments.length ? attachments : undefined,
  });

  if (!result) return null;

  return {
    conversationId: result.conversation.id,
    created: result.created,
  };
}
