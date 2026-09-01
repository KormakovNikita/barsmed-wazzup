import { NextResponse } from "next/server";
import {
  deleteMessageTemplate,
  updateMessageTemplate,
} from "@/lib/message-templates";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { title?: string; body?: string };
  try {
    body = (await request.json()) as { title?: string; body?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const template = updateMessageTemplate(id, {
      title: body.title ?? "",
      body: body.body ?? "",
    });
    if (!template) {
      return NextResponse.json({ error: "Шаблон не найден" }, { status: 404 });
    }
    return NextResponse.json({ template });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ok = deleteMessageTemplate(id);
  if (!ok) {
    return NextResponse.json({ error: "Шаблон не найден" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
