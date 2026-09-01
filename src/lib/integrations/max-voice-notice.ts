import type { MaxUpdate } from "@/lib/integrations/max";
import type { MaxMessageAttachment } from "@/lib/integrations/max-media";
import { sendMessage } from "@/lib/store";
import { getDb } from "@/lib/db";

export const MAX_VOICE_UNSUPPORTED_TEXT =
  "К сожалению, голосовые сообщения пока не поддерживаются. Пожалуйста, напишите текстом или отправьте аудио как файл 📎";

function isAudioFileName(fileName?: string): boolean {
  if (!fileName) return false;
  return /\.(ogg|opus|mp3|wav|m4a|aac|oga)$/i.test(fileName);
}

export function isMaxVoiceLikeAttachment(
  attachment: MaxMessageAttachment,
): boolean {
  if (attachment.type === "audio" || attachment.type === "voice") return true;
  if (attachment.type === "file" && isAudioFileName(attachment.filename)) {
    return true;
  }
  if (
    typeof attachment.duration === "number" &&
    attachment.duration > 0 &&
    attachment.type !== "video" &&
    attachment.type !== "image" &&
    attachment.type !== "share"
  ) {
    return true;
  }
  return false;
}

export function updateHasMaxVoice(update: MaxUpdate): boolean {
  const attachments = update.message?.body?.attachments ?? [];
  return attachments.some(isMaxVoiceLikeAttachment);
}

function noticeDedupKey(channelMessageId?: string): string | null {
  if (!channelMessageId) return null;
  return `max-voice-notice-${channelMessageId}`;
}

function wasVoiceNoticeSent(dedupKey: string): boolean {
  const row = getDb()
    .prepare(
      "SELECT 1 FROM processed_external_ids WHERE channel = ? AND external_message_id = ?",
    )
    .get("max", dedupKey);
  return Boolean(row);
}

function markVoiceNoticeSent(dedupKey: string): void {
  getDb()
    .prepare(
      "INSERT OR IGNORE INTO processed_external_ids (channel, external_message_id) VALUES (?, ?)",
    )
    .run("max", dedupKey);
}

export async function sendMaxVoiceUnsupportedNotice(params: {
  conversationId: string;
  channelMessageId?: string;
}): Promise<void> {
  const dedupKey = noticeDedupKey(params.channelMessageId);
  if (dedupKey && wasVoiceNoticeSent(dedupKey)) return;

  const { error } = await sendMessage(
    params.conversationId,
    MAX_VOICE_UNSUPPORTED_TEXT,
    undefined,
    undefined,
    undefined,
  );

  if (error) {
    console.error("[max-voice-notice] failed to send:", error);
    return;
  }

  if (dedupKey) markVoiceNoticeSent(dedupKey);
}
