import { NextResponse } from "next/server";
import { getTelegramMode, resolveTelegramPeer } from "@/lib/integrations/telegram";
import { resolveMaxPersonalPeer } from "@/lib/integrations/max-personal";
import {
  formatWhatsAppPhoneDisplay,
  normalizeWhatsAppPhone,
  resolveWhatsAppPeer,
} from "@/lib/integrations/whatsapp";
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
    const trimmedRecipient = recipient.trim();
    let externalThreadId = trimmedRecipient;
    let contactName = trimmedRecipient;
    let username: string | undefined;

    if (getTelegramMode() === "user") {
      const peer = await resolveTelegramPeer(trimmedRecipient);
      if (!peer) {
        return NextResponse.json(
          {
            error:
              "Не удалось найти пользователя. Проверьте @username или номер телефона",
          },
          { status: 404 },
        );
      }
      externalThreadId = peer.peerId;
      contactName = peer.name;
      username = peer.username;
    } else if (getTelegramMode() === "wazzup") {
      username = trimmedRecipient.startsWith("@")
        ? trimmedRecipient.slice(1)
        : /^\D/.test(trimmedRecipient)
          ? trimmedRecipient
          : undefined;
      contactName = username ? `@${username}` : trimmedRecipient;
    }

    const result = await startOutboundConversation({
      channel,
      externalThreadId,
      contactName,
      content: content.trim(),
      operatorId,
      username,
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

  if (channel === "max_personal") {
    const trimmedRecipient = recipient.trim();
    const peer = await resolveMaxPersonalPeer(trimmedRecipient);
    if (!peer) {
      return NextResponse.json(
        {
          error:
            "Не удалось найти пользователя MAX. Проверьте номер телефона или user_id",
        },
        { status: 404 },
      );
    }

    const result = await startOutboundConversation({
      channel,
      externalThreadId: peer.chatId,
      contactName: peer.name,
      content: content.trim(),
      operatorId,
      channelUserId: peer.userId,
    });

    if (!result) {
      return NextResponse.json({ error: "Не удалось создать диалог" }, { status: 500 });
    }

    return NextResponse.json(result, {
      status: result.error ? 502 : 200,
    });
  }

  if (channel === "whatsapp") {
    const trimmedRecipient = recipient.trim();
    const phone = normalizeWhatsAppPhone(trimmedRecipient);
    if (!phone || phone.length < 10) {
      return NextResponse.json(
        { error: "Укажите номер телефона в формате +79001234567" },
        { status: 400 },
      );
    }

    const peer = await resolveWhatsAppPeer(trimmedRecipient);
    const contactName = peer?.name ?? formatWhatsAppPhoneDisplay(phone);

    const result = await startOutboundConversation({
      channel,
      externalThreadId: phone,
      contactName,
      content: content.trim(),
      operatorId,
      channelUserId: phone,
    });

    if (!result) {
      return NextResponse.json({ error: "Не удалось создать диалог" }, { status: 500 });
    }

    return NextResponse.json(result, {
      status: result.error ? 502 : 200,
    });
  }

  return NextResponse.json(
    { error: "Исходящие сообщения доступны для Telegram, MAX, MAX Personal и WhatsApp" },
    { status: 400 },
  );
}
