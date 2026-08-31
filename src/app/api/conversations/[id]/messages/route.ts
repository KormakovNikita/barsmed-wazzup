import { NextResponse } from "next/server";
import { sendMessage } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const { content, operatorId } = body as {
    content?: string;
    operatorId?: string;
  };

  if (!content?.trim()) {
    return NextResponse.json(
      { error: "Текст сообщения обязателен" },
      { status: 400 },
    );
  }

  const { message, error } = await sendMessage(id, content, operatorId);

  if (!message) {
    return NextResponse.json({ error: "Диалог не найден" }, { status: 404 });
  }

  if (error) {
    return NextResponse.json({ message, error }, { status: 502 });
  }

  return NextResponse.json({ message });
}
