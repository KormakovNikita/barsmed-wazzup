import { NextResponse } from "next/server";
import { resolveTelegramPeer } from "@/lib/integrations/telegram";
import { startOutboundConversation } from "@/lib/store";
import type { Channel } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json();
  const { channel, recipient, content, operatorId } = body as {
    channel?: Channel;
    recipient?: string;
    content?: string;
    operatorId?: string;
  };

  if (!channel || !recipient?.trim() || !content?.trim()) {
    return NextResponse.json(
      { error: "channel, recipient и content обязательны" },
      { status: 400 },
    );
  }

  if (channel === "telegram") {
    const peer = await resolveTelegramPeer(recipient.trim());
    if (!peer) {
      return NextResponse.json(
        {
          error:
            "Не удалось найти пользователя. Проверьте @username или номер телефона",
        },
        { status: 404 },
      );
    }

    const result = await startOutboundConversation({
      channel,
      externalThreadId: peer.peerId,
      contactName: peer.name,
      content: content.trim(),
      operatorId,
      username: peer.username,
    });

    if (!result) {
      return NextResponse.json({ error: "Не удалось создать диалог" }, { status: 500 });
    }

    return NextResponse.json(result, {
      status: result.error ? 502 : 200,
    });
  }

  if (channel === "max") {
    const result = await startOutboundConversation({
      channel,
      externalThreadId: recipient.trim(),
      contactName: recipient.trim(),
      content: content.trim(),
      operatorId,
    });

    if (!result) {
      return NextResponse.json({ error: "Не удалось создать диалог" }, { status: 500 });
    }

    return NextResponse.json(result, {
      status: result.error ? 502 : 200,
    });
  }

  return NextResponse.json(
    { error: "Исходящие сообщения пока доступны для Telegram и MAX" },
    { status: 400 },
  );
}
