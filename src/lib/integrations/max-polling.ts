import { isMaxConfigured, pollMaxUpdates } from "@/lib/integrations/max";
import { processMaxIncomingUpdate } from "@/lib/integrations/max-incoming";

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
    const event = await processMaxIncomingUpdate(update);
    if (event) events.push(event);
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
