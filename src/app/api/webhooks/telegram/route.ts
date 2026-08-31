import { NextResponse } from "next/server";
import { parseTelegramWebhookBody } from "@/lib/integrations";
import {
  verifyTelegramWebhookSecret,
  type TelegramUpdate,
} from "@/lib/integrations/telegram";
import { processIncomingMessage } from "@/lib/store";

export async function POST(request: Request) {
  if (!verifyTelegramWebhookSecret(request)) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 403 });
  }

  const body = (await request.json()) as TelegramUpdate;
  const payload = parseTelegramWebhookBody(body);

  if (!payload) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const result = processIncomingMessage(payload);
  return NextResponse.json({
    ok: true,
    conversationId: result?.conversation.id,
    created: result?.created ?? false,
  });
}
