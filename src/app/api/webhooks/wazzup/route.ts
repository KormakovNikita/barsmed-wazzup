import { NextResponse } from "next/server";
import { parseWazzupTelegramMessage } from "@/lib/integrations/wazzup-telegram";
import { processIncomingMessage } from "@/lib/store";

interface WazzupWebhookBody {
  messages?: Parameters<typeof parseWazzupTelegramMessage>[0][];
}

export async function POST(request: Request) {
  let body: WazzupWebhookBody;
  try {
    body = (await request.json()) as WazzupWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const processed: { conversationId: string; created: boolean }[] = [];

  for (const msg of body.messages ?? []) {
    const payload = parseWazzupTelegramMessage(msg);
    if (!payload) continue;
    const result = processIncomingMessage(payload);
    if (result) {
      processed.push({
        conversationId: result.conversation.id,
        created: result.created,
      });
    }
  }

  return NextResponse.json({ ok: true, processed: processed.length, events: processed });
}
