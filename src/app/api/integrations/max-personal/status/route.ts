import { NextResponse } from "next/server";
import {
  disconnectMaxPersonalSession,
  getMaxPersonalStatus,
} from "@/lib/integrations/max-personal";

export const runtime = "nodejs";

export async function GET() {
  const status = await getMaxPersonalStatus();
  return NextResponse.json(status);
}

export async function DELETE() {
  await disconnectMaxPersonalSession();
  return NextResponse.json({ ok: true });
}
