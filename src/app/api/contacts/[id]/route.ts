import { NextResponse } from "next/server";
import { getContactById, updateContactDetails } from "@/lib/store";
import type { DealStage } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const contact = getContactById(id);
  if (!contact) {
    return NextResponse.json({ error: "Контакт не найден" }, { status: 404 });
  }
  return NextResponse.json({ contact });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as {
      name?: string;
      phone?: string | null;
      email?: string | null;
      company?: string | null;
      notes?: string | null;
      tags?: string[];
      dealStage?: DealStage;
    };

    if (body.name !== undefined && !body.name.trim()) {
      return NextResponse.json(
        { error: "Имя не может быть пустым" },
        { status: 400 },
      );
    }

    const contact = updateContactDetails(id, body);
    if (!contact) {
      return NextResponse.json({ error: "Контакт не найден" }, { status: 404 });
    }

    return NextResponse.json({ contact });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не удалось сохранить контакт",
      },
      { status: 400 },
    );
  }
}
