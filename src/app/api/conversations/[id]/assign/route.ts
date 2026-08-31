import { NextResponse } from "next/server";
import { assignConversation } from "@/lib/store";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const { operatorId } = body as { operatorId?: string | null };

  const conversation = assignConversation(id, operatorId ?? null);

  if (!conversation) {
    return NextResponse.json({ error: "Диалог не найден" }, { status: 404 });
  }

  return NextResponse.json({ conversation });
}
