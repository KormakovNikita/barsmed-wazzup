import { NextResponse } from "next/server";
import {
  getVkCallbackConfirmationString,
  parseVkCallbackEvent,
  verifyVkCallbackSecret,
  type VkCallbackEvent,
} from "@/lib/integrations/vk";
import { getVkCallbackSecret } from "@/lib/integrations/vk/config";
import { processIncomingMessage } from "@/lib/store";

export async function POST(request: Request) {
  const body = (await request.json()) as VkCallbackEvent;

  if (body.type === "confirmation") {
    const confirmation = getVkCallbackConfirmationString();
    if (!confirmation) {
      return NextResponse.json(
        { error: "VK_CALLBACK_CONFIRMATION не задан" },
        { status: 500 },
      );
    }
    return new NextResponse(confirmation, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (!verifyVkCallbackSecret(body, getVkCallbackSecret())) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 403 });
  }

  if (body.type === "message_new") {
    const payload = await parseVkCallbackEvent(body);
    if (payload) {
      const result = processIncomingMessage(payload);
      return NextResponse.json({
        ok: true,
        conversationId: result?.conversation.id,
        created: result?.created ?? false,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
