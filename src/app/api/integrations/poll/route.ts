import { NextResponse } from "next/server";
import { parseMaxWebhookBody, parseTelegramWebhookBody } from "@/lib/integrations";
import { pollMaxUpdates } from "@/lib/integrations/max";
import { pollTelegramUpdates } from "@/lib/integrations/telegram";
import { processIncomingMessage } from "@/lib/store";

let telegramOffset: number | undefined;
let maxMarker: number | undefined;

export async function POST() {
  const processed: {
    channel: string;
    conversationId?: string;
    created?: boolean;
  }[] = [];

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

  const max = await pollMaxUpdates(maxMarker);
  if (max.nextMarker !== undefined) maxMarker = max.nextMarker;

  for (const update of max.updates) {
    const payload = parseMaxWebhookBody(update);
    if (!payload) continue;
    const result = processIncomingMessage(payload);
    if (result) {
      processed.push({
        channel: "max",
        conversationId: result.conversation.id,
        created: result.created,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: processed.length,
    events: processed,
  });
}
