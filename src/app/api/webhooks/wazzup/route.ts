import { NextResponse } from "next/server";
import { parseWazzupTelegramMessage } from "@/lib/integrations/wazzup-telegram";
import { parseWazzupMaxMessage } from "@/lib/integrations/wazzup-max";
import { processIncomingMessage } from "@/lib/store";

interface WazzupWebhookMessage {
  messageId: string;
  channelId: string;
  chatType: string;
  chatId: string;
  dateTime?: string;
  type?: string;
  status?: string;
  text?: string;
  contentUri?: string;
  authorName?: string;
  isEcho?: boolean;
  contact?: {
    name?: string;
    username?: string;
    phone?: string;
  };
}

interface WazzupWebhookBody {
  messages?: WazzupWebhookMessage[];
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
    const maxPayload = await parseWazzupMaxMessage(msg);
    const payload = maxPayload ?? parseWazzupTelegramMessage(msg);
    if (!payload) continue;

    console.info(
      "[wazzup-webhook]",
      msg.chatType,
      msg.type ?? "text",
      maxPayload ? "max" : "telegram",
      "processed",
    );

    const result = processIncomingMessage(payload);
    if (result) {
      processed.push({
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
