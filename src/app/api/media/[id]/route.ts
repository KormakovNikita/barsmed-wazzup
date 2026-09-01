import { NextResponse } from "next/server";
import { getAttachmentById } from "@/lib/store";
import { readMediaFile } from "@/lib/media-storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const attachment = getAttachmentById(id);
  if (!attachment) {
    return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  }

  const buffer = readMediaFile(attachment.storagePath);
  if (!buffer) {
    return NextResponse.json({ error: "Файл недоступен" }, { status: 404 });
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    attachment.mimeType ?? "application/octet-stream",
  );
  if (attachment.fileName) {
    headers.set(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
    );
  }
  headers.set("Cache-Control", "private, max-age=3600");

  return new NextResponse(new Uint8Array(buffer), { headers });
}
