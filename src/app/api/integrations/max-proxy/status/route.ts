import { NextResponse } from "next/server";
import {
  disconnectMaxProxySession,
  getMaxProxyStatus,
} from "@/lib/integrations/max-proxy";

export const runtime = "nodejs";

export async function GET() {
  const status = await getMaxProxyStatus();
  return NextResponse.json(status);
}

export async function DELETE() {
  await disconnectMaxProxySession();
  return NextResponse.json({ ok: true });
}
