import { NextResponse } from "next/server";
import { simulateIncomingMessage } from "@/lib/store";

export async function POST(request: Request) {
  const body = await request.json();
  const { conversationId, content } = body as {
    conversationId?: string;
    content?: string;
  };

  if (!conversationId || !content?.trim()) {
    return NextResponse.json(
      { error: "conversationId и content обязательны" },
      { status: 400 },
    );
  }

  const message = simulateIncomingMessage(conversationId, content);

  if (!message) {
    return NextResponse.json({ error: "Диалог не найден" }, { status: 404 });
  }

  return NextResponse.json({ message });
}
