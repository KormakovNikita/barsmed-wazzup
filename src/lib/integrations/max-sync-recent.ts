import {
  fetchMaxChatMessages,
} from "@/lib/integrations/max-history";
import type { MaxUpdate } from "@/lib/integrations/max";
import { processMaxIncomingUpdate } from "@/lib/integrations/max-incoming";
import { shouldUseMaxBotIncoming } from "@/lib/integrations/wazzup-max";
import { listConversations } from "@/lib/store";

const lastSyncedAt = new Map<string, number>();
const SYNC_COOLDOWN_MS = 15_000;

interface MaxApiHistoryMessage {
  timestamp?: number;
  body?: NonNullable<MaxUpdate["message"]>["body"];
  sender?: {
    user_id?: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    is_bot?: boolean;
  };
}

function apiMessageToUpdate(
  chatId: string,
  message: MaxApiHistoryMessage,
): MaxUpdate {
  return {
    update_type: "message_created",
    timestamp: message.timestamp ?? Date.now(),
    message: {
      sender: message.sender,
      recipient: {
        chat_id: Number(chatId),
        user_id: message.sender?.user_id,
        chat_type: "dialog",
      },
      body: message.body,
    } as MaxUpdate["message"],
  };
}

export async function syncRecentMaxMessages(options?: {
  chatIds?: string[];
  limit?: number;
}): Promise<{ synced: number; imported: number }> {
  if (!shouldUseMaxBotIncoming()) {
    return { synced: 0, imported: 0 };
  }
  const limit = options?.limit ?? 8;
  const now = Date.now();
  const chatIds = new Set<string>();

  if (options?.chatIds?.length) {
    for (const chatId of options.chatIds) {
      if (chatId.trim()) chatIds.add(chatId.trim());
    }
  } else {
    for (const conversation of listConversations("max")) {
      if (!conversation.externalThreadId) continue;
      const updatedAt = new Date(conversation.updatedAt).getTime();
      if (conversation.awaitingReply || now - updatedAt < 2 * 60 * 60 * 1000) {
        chatIds.add(conversation.externalThreadId);
      }
    }
  }

  let synced = 0;
  let imported = 0;

  for (const chatId of chatIds) {
    const lastRun = lastSyncedAt.get(chatId) ?? 0;
    if (now - lastRun < SYNC_COOLDOWN_MS) continue;
    lastSyncedAt.set(chatId, now);

    const messages = await fetchMaxChatMessages(chatId, { maxPages: 1 });
    const latest = messages.slice(0, limit);

    for (const message of latest) {
      if (!message.body?.mid) continue;
      synced += 1;
      const update = apiMessageToUpdate(chatId, message);
      const result = await processMaxIncomingUpdate(update);
      if (result?.created) imported += 1;
    }
  }

  return { synced, imported };
}
