import { NextResponse } from "next/server";
import { dismissConversationReply } from "@/lib/store";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const conversation = dismissConversationReply(id);

  if (!conversation) {
    return NextResponse.json({ error: "Диалог не найден" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, conversation });
}
