import { NextResponse } from "next/server";
import {
  disconnectWhatsAppSession,
  getWhatsAppStatus,
} from "@/lib/integrations/whatsapp";

export const runtime = "nodejs";

export async function GET() {
  const status = await getWhatsAppStatus();
  return NextResponse.json(status);
}

export async function DELETE() {
  await disconnectWhatsAppSession();
  return NextResponse.json({ ok: true });
}
