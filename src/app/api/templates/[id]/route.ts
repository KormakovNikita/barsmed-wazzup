import { NextResponse } from "next/server";
import {
  addTemplateAttachment,
  deleteMessageTemplate,
  getMessageTemplate,
  removeTemplateAttachment,
  updateMessageTemplate,
} from "@/lib/message-templates";
import { mediaTypeFromTemplateFile } from "@/lib/template-media";

async function parseTemplateUpdateRequest(request: Request): Promise<{
  title: string;
  body: string;
  files: File[];
  removeAttachmentIds: string[];
}> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const files = form
      .getAll("file")
      .filter((item): item is File => item instanceof File && item.size > 0);
    const removeAttachmentIds = form
      .getAll("removeAttachmentIds")
      .map((item) => String(item))
      .filter(Boolean);

    return {
      title: String(form.get("title") ?? ""),
      body: String(form.get("body") ?? ""),
      files,
      removeAttachmentIds,
    };
  }

  const body = (await request.json()) as {
    title?: string;
    body?: string;
    removeAttachmentId?: string;
    removeAttachmentIds?: string[];
  };
  return {
    title: body.title ?? "",
    body: body.body ?? "",
    files: [],
    removeAttachmentIds: body.removeAttachmentIds ??
      (body.removeAttachmentId ? [body.removeAttachmentId] : []),
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const template = getMessageTemplate(id);
  if (!template) {
    return NextResponse.json({ error: "Шаблон не найден" }, { status: 404 });
  }
  return NextResponse.json({ template });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const input = await parseTemplateUpdateRequest(request);

    if (input.removeAttachmentIds.length > 0) {
      for (const attachmentId of input.removeAttachmentIds) {
        removeTemplateAttachment(attachmentId);
      }
    }

    const existing = getMessageTemplate(id);
    const remainingAttachments =
      (existing?.attachments.length ?? 0);
    const hasAttachments = remainingAttachments + input.files.length > 0;

    const template = updateMessageTemplate(id, {
      title: input.title,
      body: input.body,
      hasAttachments,
    });
    if (!template) {
      return NextResponse.json({ error: "Шаблон не найден" }, { status: 404 });
    }

    for (const file of input.files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const mimeType = file.type || "application/octet-stream";
      addTemplateAttachment(id, {
        buffer,
        mimeType,
        type: mediaTypeFromTemplateFile(mimeType, file.name),
        fileName: file.name,
      });
    }

    const saved = getMessageTemplate(id);
    return NextResponse.json({ template: saved });
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
