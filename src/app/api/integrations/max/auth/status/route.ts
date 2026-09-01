import { NextResponse } from "next/server";
import { disconnectMaxUser, getMaxStatus } from "@/lib/integrations/max-channel";

export const runtime = "nodejs";

export async function GET() {
  const status = await getMaxStatus();
  return NextResponse.json(status);
}

export async function DELETE() {
  await disconnectMaxUser();
  return NextResponse.json({ ok: true });
}
