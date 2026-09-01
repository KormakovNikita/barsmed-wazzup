import { isMaxConfigured, pollMaxUpdates } from "@/lib/integrations/max";
import { shouldUseMaxBotIncoming } from "@/lib/integrations/wazzup-max";
import { processMaxIncomingUpdate } from "@/lib/integrations/max-incoming";
import { syncRecentMaxMessages } from "@/lib/integrations/max-sync-recent";

let marker: number | undefined;
let listenerStarted = false;

export async function drainMaxUpdates(): Promise<
  { conversationId: string; created: boolean }[]
> {
  if (!isMaxConfigured() || !shouldUseMaxBotIncoming()) return [];

  const { updates, nextMarker } = await pollMaxUpdates(marker);
  if (nextMarker !== undefined) marker = nextMarker;

  const events: { conversationId: string; created: boolean }[] = [];
  for (const update of updates) {
    const event = await processMaxIncomingUpdate(update);
    if (event) events.push(event);
  }

  if (updates.length === 0) {
    await syncRecentMaxMessages();
  }

  return events;
}

export function startMaxPollingListener(): void {
  if (
    listenerStarted ||
    !isMaxConfigured() ||
    !shouldUseMaxBotIncoming() ||
    process.env.WEBHOOK_BASE_URL
  ) {
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
