import { NextResponse } from "next/server";
import { backfillAllMaxMedia } from "@/lib/integrations/max-history";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    chatIds?: string[];
  };

  const result = await backfillAllMaxMedia({
    chatIds: body.chatIds,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, results: result.synced });
}
