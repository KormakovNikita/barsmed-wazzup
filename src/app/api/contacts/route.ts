import { NextResponse } from "next/server";
import { createContact, listContacts } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? undefined;
  const contacts = listContacts(query ?? undefined);
  return NextResponse.json({ contacts });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      phone?: string;
      email?: string;
      company?: string;
      notes?: string;
      tags?: string[];
    };

    if (!body.name?.trim()) {
      return NextResponse.json(
        { error: "Укажите имя контакта" },
        { status: 400 },
      );
    }

    const contact = createContact({
      name: body.name,
      phone: body.phone,
      email: body.email,
      company: body.company,
      notes: body.notes,
      tags: body.tags,
    });

    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Не удалось создать контакт",
      },
      { status: 400 },
    );
  }
}
