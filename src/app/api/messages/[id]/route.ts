import { NextResponse } from "next/server";
import { deleteMessage } from "@/lib/store";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const revoke = url.searchParams.get("revoke") === "true";

  const result = await deleteMessage(id, { revoke });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Не удалось удалить сообщение" },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
