import { NextResponse } from "next/server";
import { parseWazzupTelegramMessage } from "@/lib/integrations/wazzup-telegram";
import { parseWazzupMaxMessage, isWazzupMaxMessage, shouldWazzupHandleMaxMessage } from "@/lib/integrations/wazzup-max";
import { parseWazzupWhatsAppMessage } from "@/lib/integrations/wazzup-whatsapp";
import {
  extractWazzupQuotedMessageId,
  extractWazzupQuotedText,
} from "@/lib/integrations/wazzup-quote";
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
  refMessageId?: string;
  quoted_message_id?: string;
  quotedMessageId?: string;
  quotedMessage?: {
    messageId?: string;
    id?: string;
    mid?: string;
    message_id?: string;
    text?: string;
    content?: string;
  };
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
    const quotedId = extractWazzupQuotedMessageId(msg);
    if (quotedId || msg.quotedMessage) {
      console.info(
        "[wazzup-webhook] quote",
        msg.chatType,
        "ref=",
        quotedId ?? "none",
        "text=",
        (extractWazzupQuotedText(msg) ?? "").slice(0, 80),
      );
    }

    if (isWazzupMaxMessage(msg)) {
      console.info(
        "[wazzup-webhook] max",
        msg.type ?? "text",
        msg.isEcho ? "echo" : "in",
        msg.contentUri ? "media" : "text",
        shouldWazzupHandleMaxMessage(msg) ? "accept" : "skip",
      );
    }

    const maxPayload = await parseWazzupMaxMessage(msg);
    const whatsappPayload = maxPayload
      ? null
      : await parseWazzupWhatsAppMessage(msg);
    const payload =
      maxPayload ?? whatsappPayload ?? parseWazzupTelegramMessage(msg);
    if (!payload) continue;

    console.info(
      "[wazzup-webhook]",
      msg.chatType,
      msg.type ?? "text",
      maxPayload ? "max" : whatsappPayload ? "whatsapp" : "telegram",
      "processed",
      payload.replyToChannelMessageId
        ? `reply=${payload.replyToChannelMessageId}`
        : "no-reply",
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
