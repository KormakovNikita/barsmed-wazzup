import { NextResponse } from "next/server";
import {
  disconnectTelegramUser,
  getTelegramStatus,
} from "@/lib/integrations/telegram";

export const runtime = "nodejs";

export async function GET() {
  const status = await getTelegramStatus();
  return NextResponse.json(status);
}

export async function DELETE() {
  await disconnectTelegramUser();
  return NextResponse.json({ ok: true });
}
