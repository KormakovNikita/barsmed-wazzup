import { getTelegramMode } from "@/lib/integrations/telegram";
import {
  getTelegramUserClient,
  isTelegramUserAuthorized,
  restartTelegramUserListener,
} from "@/lib/integrations/telegram-user";
import { processTelegramUserMessage } from "@/lib/integrations/telegram-user/message-handler";

let listenerStarted = false;
let syncing = false;
let initialSyncDone = false;
let lastLightSyncAt = 0;

const LIGHT_SYNC_INTERVAL_MS = 5 * 60 * 1000;

export async function drainTelegramUserUpdates(): Promise<
  { conversationId: string; created: boolean }[]
> {
  if (getTelegramMode() !== "user") return [];

  if (!(await isTelegramUserAuthorized())) {
    return [];
  }

  if (syncing) return [];

  // Real-time listener handles new messages; avoid heavy history sync every tick.
  if (initialSyncDone) {
    const now = Date.now();
    if (now - lastLightSyncAt < LIGHT_SYNC_INTERVAL_MS) {
      return [];
    }
  }

  syncing = true;

  const events: { conversationId: string; created: boolean }[] = [];

  try {
    const client = await getTelegramUserClient();
    if (!client?.connected) {
      await restartTelegramUserListener();
      return [];
    }

    const limit = initialSyncDone ? 5 : 20;
    const perDialogLimit = initialSyncDone ? 1 : 8;

    const dialogs = await client.getDialogs({ limit });

    for (const dialog of dialogs) {
      const entity = dialog.entity;
      if (!entity) continue;

      const messages = await client.getMessages(entity, {
        limit: perDialogLimit,
      });

      for (const message of messages) {
        const event = await processTelegramUserMessage(message);
        if (event) events.push(event);
      }
    }

    initialSyncDone = true;
    lastLightSyncAt = Date.now();
  } catch (error) {
    console.error("[telegram-user-polling] sync failed:", error);
    await restartTelegramUserListener();
  } finally {
    syncing = false;
  }

  return events;
}

export function startTelegramUserPollingListener(): void {
  if (listenerStarted || getTelegramMode() !== "user") return;

  listenerStarted = true;
  const intervalMs = Number(process.env.TELEGRAM_USER_POLL_INTERVAL_MS ?? 5000);

  const tick = () => {
    drainTelegramUserUpdates().catch((error) => {
      console.error("[telegram-user-polling] tick failed:", error);
    });
  };

  tick();
  setInterval(tick, intervalMs);
}
