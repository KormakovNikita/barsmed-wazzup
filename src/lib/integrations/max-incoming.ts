import { parseMaxUpdate, type MaxUpdate } from "@/lib/integrations/max";
import {
  enrichMaxUpdate,
  scheduleMaxMediaRetry,
  shouldScheduleMediaRetry,
} from "@/lib/integrations/max-enrich";
import {
  downloadMaxAttachments,
  maxAttachmentPreview,
} from "@/lib/integrations/max-media";
import { processIncomingMessage } from "@/lib/store";

export async function processMaxIncomingUpdate(
  update: MaxUpdate,
  options?: { skipEnrich?: boolean },
): Promise<{ conversationId: string; created: boolean } | null> {
  const enriched = options?.skipEnrich
    ? update
    : await enrichMaxUpdate(update);

  const parsed = parseMaxUpdate(enriched);
  if (!parsed) {
    if (!options?.skipEnrich && shouldScheduleMediaRetry(enriched)) {
      scheduleMaxMediaRetry(enriched, (retryUpdate) =>
        processMaxIncomingUpdate(retryUpdate, { skipEnrich: true }),
      );
    }
    return null;
  }

  const rawAttachments = enriched.message?.body?.attachments;
  const messageMid =
    enriched.message?.body?.mid ??
    parsed.channelMessageId ??
    parsed.externalMessageId.replace(/^max-/, "");

  const attachments = await downloadMaxAttachments(rawAttachments, {
    messageId: messageMid,
  });

  let content = parsed.content;
  if (!content.trim() && rawAttachments?.length) {
    content = maxAttachmentPreview(rawAttachments);
  }
  const transcription = rawAttachments
    ?.find((item) => item.type === "audio" || item.type === "voice")
    ?.transcription?.trim();
  if (transcription && !content.includes(transcription)) {
    content = content.trim()
      ? `${content}\n\n📝 ${transcription}`
      : `📝 ${transcription}`;
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

  return {
    conversationId: result.conversation.id,
    created: result.created,
  };
}
