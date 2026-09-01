import { NextResponse } from "next/server";
import {
  createMessageTemplate,
  listMessageTemplates,
} from "@/lib/message-templates";

export async function GET() {
  return NextResponse.json({ templates: listMessageTemplates() });
}

export async function POST(request: Request) {
  let body: { title?: string; body?: string };
  try {
    body = (await request.json()) as { title?: string; body?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const template = createMessageTemplate({
      title: body.title ?? "",
      body: body.body ?? "",
    });
    return NextResponse.json({ template });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка" },
      { status: 400 },
    );
  }
}
