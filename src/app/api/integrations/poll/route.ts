import { NextResponse } from "next/server";
import { parseTelegramWebhookBody } from "@/lib/integrations";
import { drainMaxUpdates } from "@/lib/integrations/max-polling";
import { drainTelegramUpdates } from "@/lib/integrations/telegram-polling";
import { drainTelegramUserUpdates } from "@/lib/integrations/telegram-user-polling";
import { getTelegramMode, pollTelegramUpdates } from "@/lib/integrations/telegram";
import { processIncomingMessage } from "@/lib/store";

let telegramOffset: number | undefined;
let pollRunning = false;

async function runPoll(): Promise<{
  processed: { channel: string; conversationId?: string; created?: boolean }[];
}> {
  const processed: {
    channel: string;
    conversationId?: string;
    created?: boolean;
  }[] = [];

  if (getTelegramMode() === "bot") {
    const telegramEvents = await drainTelegramUpdates();
    for (const event of telegramEvents) {
      processed.push({
        channel: "telegram",
        conversationId: event.conversationId,
        created: event.created,
      });
    }
  } else if (getTelegramMode() === "user") {
    const telegramEvents = await drainTelegramUserUpdates();
    for (const event of telegramEvents) {
      processed.push({
        channel: "telegram",
        conversationId: event.conversationId,
        created: event.created,
      });
    }
  } else {
    const tg = await pollTelegramUpdates(telegramOffset);
    if (tg.nextOffset !== undefined) telegramOffset = tg.nextOffset;

    for (const update of tg.updates) {
      const payload = parseTelegramWebhookBody(update);
      if (!payload) continue;
      const result = processIncomingMessage(payload);
      if (result) {
        processed.push({
          channel: "telegram",
          conversationId: result.conversation.id,
          created: result.created,
        });
      }
    }
  }

  const maxEvents = await drainMaxUpdates();
  for (const event of maxEvents) {
    processed.push({
      channel: "max",
      conversationId: event.conversationId,
      created: event.created,
    });
  }

  return { processed };
}

export async function POST() {
  if (pollRunning) {
    return NextResponse.json({ ok: true, processed: 0, skipped: true });
  }

  pollRunning = true;

  try {
    const timeoutMs = Number(process.env.INTEGRATIONS_POLL_TIMEOUT_MS ?? 8000);
    let timedOut = false;

    const result = await Promise.race([
      runPoll(),
      new Promise<{ processed: [] }>((resolve) => {
        setTimeout(() => {
          timedOut = true;
          resolve({ processed: [] });
        }, timeoutMs);
      }),
    ]);

    return NextResponse.json({
      ok: true,
      processed: result.processed.length,
      events: result.processed,
      timedOut,
    });
  } finally {
    pollRunning = false;
  }
}
