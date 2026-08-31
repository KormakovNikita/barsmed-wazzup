import { NextResponse } from "next/server";
import { parseMaxWebhookBody } from "@/lib/integrations";
import {
  verifyMaxWebhookSecret,
  type MaxUpdate,
} from "@/lib/integrations/max";
import { processIncomingMessage } from "@/lib/store";

export async function POST(request: Request) {
  if (!verifyMaxWebhookSecret(request)) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 403 });
  }

  const body = (await request.json()) as MaxUpdate;
  const payload = parseMaxWebhookBody(body);

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
