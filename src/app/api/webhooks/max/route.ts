import { NextResponse } from "next/server";
import {
  verifyMaxWebhookSecret,
  type MaxUpdate,
} from "@/lib/integrations/max";
import { processMaxIncomingUpdate } from "@/lib/integrations/max-incoming";

export async function POST(request: Request) {
  if (!verifyMaxWebhookSecret(request)) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 403 });
  }

  const body = (await request.json()) as MaxUpdate;
  const result = await processMaxIncomingUpdate(body);

  if (!result) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  return NextResponse.json({
    ok: true,
    conversationId: result.conversationId,
    created: result.created,
  });
}
