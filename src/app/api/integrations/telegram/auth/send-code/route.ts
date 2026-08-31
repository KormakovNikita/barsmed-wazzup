import { NextResponse } from "next/server";
import { startTelegramAuth } from "@/lib/integrations/telegram";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { phoneNumber } = body as { phoneNumber?: string };

    if (!phoneNumber?.trim()) {
      return NextResponse.json(
        { error: "Укажите номер телефона" },
        { status: 400 },
      );
    }

    const result = await startTelegramAuth(phoneNumber.trim());
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Ошибка отправки кода",
      },
      { status: 500 },
    );
  }
}
