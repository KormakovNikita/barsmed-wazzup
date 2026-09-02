import { NextResponse } from "next/server";
import {
  createMessageTemplate,
  listMessageTemplates,
  addTemplateAttachment,
} from "@/lib/message-templates";
import { mediaTypeFromTemplateFile } from "@/lib/template-media";

async function parseTemplateRequest(request: Request): Promise<{
  title: string;
  body: string;
  files: File[];
}> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const files = form
      .getAll("file")
      .filter((item): item is File => item instanceof File && item.size > 0);
    return {
      title: String(form.get("title") ?? ""),
      body: String(form.get("body") ?? ""),
      files,
    };
  }

  const body = (await request.json()) as { title?: string; body?: string };
  return {
    title: body.title ?? "",
    body: body.body ?? "",
    files: [],
  };
}

async function attachFileToTemplate(templateId: string, file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  return addTemplateAttachment(templateId, {
    buffer,
    mimeType,
    type: mediaTypeFromTemplateFile(mimeType, file.name),
    fileName: file.name,
  });
}

export async function GET() {
  return NextResponse.json({ templates: listMessageTemplates() });
}

export async function POST(request: Request) {
  try {
    const input = await parseTemplateRequest(request);
    const template = createMessageTemplate({
      title: input.title,
      body: input.body,
      hasAttachments: input.files.length > 0,
    });

    for (const file of input.files) {
      await attachFileToTemplate(template.id, file);
    }

    const templates = listMessageTemplates();
    const saved = templates.find((item) => item.id === template.id) ?? template;
    return NextResponse.json({ template: saved });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка" },
      { status: 400 },
    );
  }
}
