import { parseTelegramWebhookBody } from "@/lib/integrations";
import {
  deleteTelegramWebhook,
  isTelegramBotConfigured,
  pollTelegramBotUpdates,
} from "@/lib/integrations/telegram-bot";
import { getTelegramMode } from "@/lib/integrations/telegram";
import { processIncomingMessage } from "@/lib/store";

let offset: number | undefined;
let listenerStarted = false;
let webhookCleared = false;

export async function drainTelegramUpdates(): Promise<
  { conversationId: string; created: boolean }[]
> {
  if (!isTelegramBotConfigured() || getTelegramMode() !== "bot") {
    return [];
  }

  if (!webhookCleared && !process.env.WEBHOOK_BASE_URL) {
    await deleteTelegramWebhook();
    webhookCleared = true;
  }

  const { updates, nextOffset } = await pollTelegramBotUpdates(offset);
  if (nextOffset !== undefined) offset = nextOffset;

  const events: { conversationId: string; created: boolean }[] = [];
  for (const update of updates) {
    const payload = parseTelegramWebhookBody(update);
    if (!payload) continue;
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

export function startTelegramPollingListener(): void {
  if (
    listenerStarted ||
    getTelegramMode() !== "bot" ||
    !isTelegramBotConfigured() ||
    process.env.WEBHOOK_BASE_URL
  ) {
    return;
  }

  listenerStarted = true;
  const intervalMs = Number(process.env.TELEGRAM_POLL_INTERVAL_MS ?? 5000);

  const tick = () => {
    drainTelegramUpdates().catch((error) => {
      console.error("[telegram-polling] failed:", error);
    });
  };

  tick();
  setInterval(tick, intervalMs);
}
