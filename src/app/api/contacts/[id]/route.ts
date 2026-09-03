import { NextResponse } from "next/server";
import { getContactById, updateContactDetails } from "@/lib/store";
import type { ClientStatus, DealStage } from "@/lib/types";

export const runtime = "nodejs";

const CLIENT_STATUSES = new Set<ClientStatus>([
  "warm",
  "non_target",
  "booked",
]);

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
      clientStatus?: ClientStatus | null;
      isVip?: boolean;
    };

    if (body.name !== undefined && !body.name.trim()) {
      return NextResponse.json(
        { error: "Имя не может быть пустым" },
        { status: 400 },
      );
    }

    if (
      body.clientStatus !== undefined &&
      body.clientStatus !== null &&
      !CLIENT_STATUSES.has(body.clientStatus)
    ) {
      return NextResponse.json(
        { error: "Некорректный статус клиента" },
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
