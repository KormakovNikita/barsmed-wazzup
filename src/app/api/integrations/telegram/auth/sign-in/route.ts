import { NextResponse } from "next/server";
import { completeTelegramAuth } from "@/lib/integrations/telegram";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { authId, code, password } = body as {
      authId?: string;
      code?: string;
      password?: string;
    };

    if (!authId || !code?.trim()) {
      return NextResponse.json(
        { error: "authId и code обязательны" },
        { status: 400 },
      );
    }

    const result = await completeTelegramAuth(
      authId,
      code.trim(),
      password?.trim(),
    );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Ошибка входа",
      },
      { status: 500 },
    );
  }
}
