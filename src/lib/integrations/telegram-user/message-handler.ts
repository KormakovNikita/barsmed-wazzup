import { getPeerId } from "teleproto/Utils";
import type { Api } from "teleproto/tl";
import type { CustomMessage } from "teleproto/tl/custom/message";
import type { TelegramClient } from "teleproto";
import { mediaPreviewLabel } from "@/lib/media-storage";
import { processIncomingMessage } from "@/lib/store";
import { extractTelegramMedia, inspectTelegramMedia } from "./media";

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

async function resolvePeerInfo(
  message: IncomingTelegramMessage,
  client?: TelegramClient | null,
): Promise<{ name: string; username?: string }> {
  if (!client || !("peerId" in message) || !message.peerId) {
    return { name: "Telegram" };
  }

  try {
    const entity = await client.getEntity(message.peerId);
    if ("firstName" in entity) {
      const name = [entity.firstName, entity.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      return {
        name: name || entity.username || "Telegram",
        username: entity.username ?? undefined,
      };
    }
    if ("title" in entity) {
      return { name: String(entity.title) };
    }
  } catch {
    // fall through
  }

  return { name: "Telegram" };
}

export async function processTelegramUserMessage(
  message: IncomingTelegramMessage,
  client?: TelegramClient | null,
): Promise<{ conversationId: string; created: boolean } | null> {
  if (!message) return null;

  const isOutbound = "out" in message && Boolean(message.out);

  const threadId = getThreadId(message);
  if (!threadId) return null;

  let name: string;
  let username: string | undefined;

  if (isOutbound) {
    const peer = await resolvePeerInfo(message, client);
    name = peer.name;
    username = peer.username;
  } else {
    const sender = await resolveSenderInfo(message);
    if (sender.skip) return null;
    name = sender.name;
    username = sender.username;
  }

  const messageId = "id" in message ? message.id : 0;
  const messageDate = "date" in message ? message.date : 0;

  const mediaInfo = inspectTelegramMedia(message);

  let attachments: import("@/lib/types").IncomingAttachmentPayload[] | undefined;
  try {
    const media = await extractTelegramMedia(message, client);
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
      : mediaInfo
        ? mediaPreviewLabel(mediaInfo.type, mediaInfo.fileName)
        : "");

  if (!content && !attachments?.length && !mediaInfo) return null;

  const result = processIncomingMessage({
    channel: "telegram",
    externalThreadId: threadId,
    externalMessageId: `tg-user-${messageId}-${messageDate}`,
    channelMessageId: String(messageId),
    replyToChannelMessageId: getReplyToChannelMessageId(message),
    content:
      content ||
      (attachments?.length
        ? mediaPreviewLabel(attachments[0].type, attachments[0].fileName)
        : mediaInfo
          ? mediaPreviewLabel(mediaInfo.type, mediaInfo.fileName)
          : ""),
    senderName: name,
    senderUsername: username,
    attachments,
    direction: isOutbound ? "out" : "in",
  });

  if (!result) return null;

  console.info(
    `[telegram-user] processed ${isOutbound ? "outgoing" : "incoming"} message ${name} (${threadId}): ${content.slice(0, 80)}`,
  );

  return {
    conversationId: result.conversation.id,
    created: result.created,
  };
}
