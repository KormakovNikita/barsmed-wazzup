import { NextResponse } from "next/server";
import {
  getConversationDetail,
  markConversationRead,
} from "@/lib/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const detail = getConversationDetail(id);

  if (!detail) {
    return NextResponse.json({ error: "Диалог не найден" }, { status: 404 });
  }

  markConversationRead(id);

  return NextResponse.json({ conversation: detail });
}
