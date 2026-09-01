import { getMaxUserMode } from "@/lib/integrations/max-user";
import {
  getMaxUserClient,
  isMaxUserAuthorized,
  restartMaxUserListener,
} from "@/lib/integrations/max-user/index";
import { processMaxUserMessage } from "@/lib/integrations/max-user/message-handler";

let listenerStarted = false;
let syncing = false;
let initialSyncDone = false;
let lastLightSyncAt = 0;

const LIGHT_SYNC_INTERVAL_MS = 5 * 60 * 1000;

export async function drainMaxUserUpdates(): Promise<
  { conversationId: string; created: boolean }[]
> {
  if (getMaxUserMode() !== "user") return [];
  if (!(await isMaxUserAuthorized())) return [];
  if (syncing) return [];

  if (initialSyncDone) {
    const now = Date.now();
    if (now - lastLightSyncAt < LIGHT_SYNC_INTERVAL_MS) {
      return [];
    }
  }

  syncing = true;
  const events: { conversationId: string; created: boolean }[] = [];

  try {
    const client = await getMaxUserClient();
    if (!client?.isAuthorized) {
      await restartMaxUserListener();
      return [];
    }

    const chats =
      client.lastSyncPayload &&
      typeof client.lastSyncPayload === "object" &&
      client.lastSyncPayload !== null &&
      "chats" in client.lastSyncPayload &&
      Array.isArray(
        (client.lastSyncPayload as { chats?: unknown[] }).chats,
      )
        ? ((client.lastSyncPayload as { chats: { id?: number }[] }).chats ??
          [])
        : [];

    const dialogLimit = initialSyncDone ? 3 : 10;
    const historyDepth = initialSyncDone ? 2 : 8;

    for (const chat of chats.slice(0, dialogLimit)) {
      if (chat.id == null) continue;
      const messages = await client.getHistory(
        chat.id,
        Date.now(),
        historyDepth,
        0,
      );

      for (const message of messages) {
        const event = await processMaxUserMessage(message, client.me?.id ?? null);
        if (event) events.push(event);
      }
    }

    initialSyncDone = true;
    lastLightSyncAt = Date.now();
  } catch (error) {
    console.error("[max-user-polling] sync failed:", error);
    await restartMaxUserListener();
  } finally {
    syncing = false;
  }

  return events;
}

export function startMaxUserPollingListener(): void {
  if (listenerStarted || getMaxUserMode() !== "user") return;

  listenerStarted = true;
  const intervalMs = Number(process.env.MAX_USER_POLL_INTERVAL_MS ?? 5000);

  const tick = () => {
    drainMaxUserUpdates().catch((error) => {
      console.error("[max-user-polling] tick failed:", error);
    });
  };

  tick();
  setInterval(tick, intervalMs);
}
