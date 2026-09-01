import { getPeerId } from "teleproto/Utils";
import type { Api } from "teleproto/tl";
import type { CustomMessage } from "teleproto/tl/custom/message";
import { mediaPreviewLabel } from "@/lib/media-storage";
import { processIncomingMessage } from "@/lib/store";
import { extractTelegramMedia } from "./media";

type IncomingTelegramMessage = CustomMessage | Api.Message;

function getThreadId(message: IncomingTelegramMessage): string | null {
  if ("peerId" in message && message.peerId) {
    return getPeerId(message.peerId);
  }
  if ("chatId" in message && message.chatId != null) {
    return message.chatId.toString();
  }
  return null;
}

function getMessageText(message: IncomingTelegramMessage): string {
  const text =
    ("text" in message && message.text) ||
    ("message" in message && message.message) ||
    "";
  return String(text).trim();
}

async function resolveSenderInfo(message: IncomingTelegramMessage): Promise<{
  name: string;
  username?: string;
  skip: boolean;
}> {
  if (!("getSender" in message) || typeof message.getSender !== "function") {
    return { name: "Telegram", skip: false };
  }

  const sender = await message.getSender();
  if (!sender) {
    return { name: "Telegram", skip: false };
  }

  if ("bot" in sender && sender.bot) {
    return { name: "Bot", skip: true };
  }

  if ("firstName" in sender) {
    const name = [sender.firstName, sender.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    return {
      name: name || sender.username || "Telegram",
      username: sender.username ?? undefined,
      skip: false,
    };
  }

  if ("title" in sender) {
    return { name: String(sender.title), skip: false };
  }

  return { name: "Telegram", skip: false };
}

function getReplyToChannelMessageId(
  message: IncomingTelegramMessage,
): string | undefined {
  if ("replyToMsgId" in message && message.replyToMsgId != null) {
    return String(message.replyToMsgId);
  }
  if (
    "replyTo" in message &&
    message.replyTo &&
    typeof message.replyTo === "object" &&
    "replyToMsgId" in message.replyTo &&
    message.replyTo.replyToMsgId != null
  ) {
    return String(message.replyTo.replyToMsgId);
  }
  return undefined;
}

export async function processTelegramUserMessage(
  message: IncomingTelegramMessage,
): Promise<{ conversationId: string; created: boolean } | null> {
  if (!message || ("out" in message && message.out)) return null;

  const threadId = getThreadId(message);
  if (!threadId) return null;

  const { name, username, skip } = await resolveSenderInfo(message);
  if (skip) return null;

  const messageId = "id" in message ? message.id : 0;
  const messageDate = "date" in message ? message.date : 0;

  let attachments: import("@/lib/types").IncomingAttachmentPayload[] | undefined;
  try {
    const media = await extractTelegramMedia(message);
    attachments = media ? [media] : undefined;
  } catch (error) {
    console.error("[telegram-user] media download failed:", error);
    attachments = undefined;
  }

  const text = getMessageText(message);
  const content =
    text ||
    (attachments?.length
      ? mediaPreviewLabel(attachments[0].type, attachments[0].fileName)
      : "");

  if (!content && !attachments?.length) return null;

  const result = processIncomingMessage({
    channel: "telegram",
    externalThreadId: threadId,
    externalMessageId: `tg-user-${messageId}-${messageDate}`,
    channelMessageId: String(messageId),
    replyToChannelMessageId: getReplyToChannelMessageId(message),
    content: content || mediaPreviewLabel(attachments![0].type, attachments![0].fileName),
    senderName: name,
    senderUsername: username,
    attachments,
  });

  if (!result) return null;

  console.info(
    `[telegram-user] processed message from ${name} (${threadId}): ${content.slice(0, 80)}`,
  );

  return {
    conversationId: result.conversation.id,
    created: result.created,
  };
}
