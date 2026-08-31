import { parseMaxWebhookBody } from "@/lib/integrations";
import { isMaxConfigured, pollMaxUpdates } from "@/lib/integrations/max";
import { processIncomingMessage } from "@/lib/store";

let marker: number | undefined;
let listenerStarted = false;

export async function drainMaxUpdates(): Promise<
  { conversationId: string; created: boolean }[]
> {
  if (!isMaxConfigured()) return [];

  const { updates, nextMarker } = await pollMaxUpdates(marker);
  if (nextMarker !== undefined) marker = nextMarker;

  const events: { conversationId: string; created: boolean }[] = [];
  for (const update of updates) {
    const payload = parseMaxWebhookBody(update);
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

export function startMaxPollingListener(): void {
  if (listenerStarted || !isMaxConfigured() || process.env.WEBHOOK_BASE_URL) {
    return;
  }

  listenerStarted = true;
  const intervalMs = Number(process.env.MAX_POLL_INTERVAL_MS ?? 5000);

  const tick = () => {
    drainMaxUpdates().catch((error) => {
      console.error("[max-polling] failed:", error);
    });
  };

  tick();
  setInterval(tick, intervalMs);
}
