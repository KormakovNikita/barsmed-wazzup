import { NextResponse } from "next/server";
import { sendMessage } from "@/lib/store";
import { guessMimeFromFileName } from "@/lib/media-storage";
import { mediaTypeFromFile } from "@/lib/integrations/telegram-user/media";
import type { OutboundAttachmentPayload } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const content = String(form.get("content") ?? "");
    const operatorId = form.get("operatorId")?.toString();
    const replyToMessageId = form.get("replyToMessageId")?.toString();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Файл не прикреплён" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || guessMimeFromFileName(file.name);
    const attachments: OutboundAttachmentPayload[] = [
      {
        type: mediaTypeFromFile(mimeType, file.name),
        mimeType,
        fileName: file.name,
        buffer,
      },
    ];

    const { message, error } = await sendMessage(
      id,
      content,
      operatorId,
      attachments,
      replyToMessageId,
    );

    if (!message) {
      return NextResponse.json({ error: "Диалог не найден" }, { status: 404 });
    }
    if (error) {
      return NextResponse.json({ message, error }, { status: 502 });
    }
    return NextResponse.json({ message });
  }

  const body = await request.json();
  const { content, operatorId, replyToMessageId } = body as {
    content?: string;
    operatorId?: string;
    replyToMessageId?: string;
  };

  if (!content?.trim()) {
    return NextResponse.json(
      { error: "Текст сообщения обязателен" },
      { status: 400 },
    );
  }

  const { message, error } = await sendMessage(
    id,
    content,
    operatorId,
    undefined,
    replyToMessageId,
  );

  if (!message) {
    return NextResponse.json({ error: "Диалог не найден" }, { status: 404 });
  }

  if (error) {
    return NextResponse.json({ message, error }, { status: 502 });
  }

  return NextResponse.json({ message });
}
