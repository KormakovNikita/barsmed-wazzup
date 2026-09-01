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

export async function drainTelegramUserUpdates(): Promise<
  { conversationId: string; created: boolean }[]
> {
  if (getTelegramMode() !== "user") return [];

  if (!(await isTelegramUserAuthorized())) {
    return [];
  }

  if (syncing) return [];
  syncing = true;

  const events: { conversationId: string; created: boolean }[] = [];

  try {
    const client = await getTelegramUserClient();
    if (!client?.connected) {
      await restartTelegramUserListener();
      return [];
    }

    const limit = initialSyncDone ? 30 : 50;
    const dialogs = await client.getDialogs({ limit });
    const perDialogLimit = initialSyncDone ? 3 : 15;

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
