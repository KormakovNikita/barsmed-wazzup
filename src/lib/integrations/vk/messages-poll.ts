import { processIncomingMessage } from "@/lib/store";
import { getVkConversations } from "./api";
import { parseVkApiMessage } from "./parse";
import { getVkAccessToken, isVkConfigured } from "./config";

const seenMessageIds = new Set<string>();

function messageKey(peerId: number, messageId: number): string {
  return `${peerId}:${messageId}`;
}

export async function drainVkMessagesUpdates(): Promise<
  { conversationId: string; created: boolean }[]
> {
  const token = getVkAccessToken();
  if (!token || !isVkConfigured()) {
    return [];
  }

  const events: { conversationId: string; created: boolean }[] = [];

  for (const filter of ["unread", "unanswered"] as const) {
    const conversations = await getVkConversations(token, {
      filter,
      count: 30,
    });
    if (!conversations.ok) {
      console.error("[vk-messages-poll] getConversations failed:", conversations.error);
      return events;
    }

    for (const item of conversations.items) {
      const message = item.last_message;
      if (!message) continue;

      const key = messageKey(message.peer_id, message.id);
      if (seenMessageIds.has(key)) continue;

      const payload = await parseVkApiMessage(message);
      if (!payload) {
        seenMessageIds.add(key);
        continue;
      }

      seenMessageIds.add(key);
      const result = processIncomingMessage(payload);
      if (result) {
        events.push({
          conversationId: result.conversation.id,
          created: result.created,
        });
      }
    }
  }

  return events;
}
