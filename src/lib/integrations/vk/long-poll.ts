import { processIncomingMessage } from "@/lib/store";
import { getVkLongPollServer, pollVkLongPoll, type VkLongPollServer } from "./api";
import { drainVkMessagesUpdates } from "./messages-poll";
import {
  enrichVkLongPollPayload,
  parseVkLongPollUpdate,
} from "./parse";
import {
  getVkAccessToken,
  getVkGroupId,
  getVkPollIntervalMs,
  isVkConfigured,
  shouldVkUseCallback,
} from "./config";

let listenerStarted = false;
let longPollServer: VkLongPollServer | null = null;
let useMessagesPoll = false;
let longPollDisabledLogged = false;

async function refreshLongPollServer(): Promise<boolean> {
  const groupId = getVkGroupId();
  const token = getVkAccessToken();
  if (!groupId || !token) return false;

  const result = await getVkLongPollServer(groupId, token);
  if (!result.ok) {
    if (result.error.includes("(15)")) {
      useMessagesPoll = true;
      if (!longPollDisabledLogged) {
        console.info(
          "[vk] Long Poll недоступен для этого токена — используем messages.getConversations",
        );
        longPollDisabledLogged = true;
      }
    } else {
      console.error("[vk-long-poll] getLongPollServer failed:", result.error);
    }
    longPollServer = null;
    return false;
  }

  longPollServer = result.server;
  useMessagesPoll = false;
  return true;
}

async function drainVkLongPollOnly(): Promise<
  { conversationId: string; created: boolean }[]
> {
  if (!longPollServer) {
    const ready = await refreshLongPollServer();
    if (!ready || !longPollServer) return [];
  }

  const poll = await pollVkLongPoll(longPollServer);
  if (!poll.ok) {
    if (poll.needRefresh) {
      await refreshLongPollServer();
    } else {
      console.error("[vk-long-poll] poll failed:", poll.error);
    }
    return [];
  }

  longPollServer = {
    ...longPollServer,
    ts: poll.data.ts,
  };

  const events: { conversationId: string; created: boolean }[] = [];

  for (const update of poll.data.updates) {
    const partial = parseVkLongPollUpdate(update);
    if (!partial) continue;

    const payload = await enrichVkLongPollPayload(partial);
    const result = processIncomingMessage(payload);
    if (result) {
      events.push({
        conversationId: result.conversation.id,
        created: result.created,
      });
    }
  }

  return events;
}

export async function drainVkLongPollUpdates(): Promise<
  { conversationId: string; created: boolean }[]
> {
  if (!isVkConfigured() || shouldVkUseCallback()) {
    return [];
  }

  if (useMessagesPoll) {
    return drainVkMessagesUpdates();
  }

  const events = await drainVkLongPollOnly();
  if (useMessagesPoll) {
    return [...events, ...(await drainVkMessagesUpdates())];
  }
  return events;
}

export function startVkLongPollListener(): void {
  if (listenerStarted || shouldVkUseCallback()) {
    return;
  }

  listenerStarted = true;
  const intervalMs = getVkPollIntervalMs();

  const tick = () => {
    if (!isVkConfigured()) return;
    drainVkLongPollUpdates().catch((error) => {
      console.error("[vk] poll failed:", error);
    });
  };

  tick();
  setInterval(tick, intervalMs);
  console.info("[vk] listener started");
}
