import { NextResponse } from "next/server";
import { syncAllMaxHistory } from "@/lib/integrations/max-history";
import {
  importWazzupMaxHistory,
  isWazzupConfigured,
} from "@/lib/integrations/wazzup-import";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    source?: "max" | "wazzup" | "all";
    chatIds?: string[];
  };

  const source = body.source ?? "all";
  const results: Record<string, unknown> = {};

  if (source === "wazzup" || source === "all") {
    if (isWazzupConfigured()) {
      results.wazzup = await importWazzupMaxHistory();
    } else if (source === "wazzup") {
      return NextResponse.json(
        { error: "WAZZUP_API_KEY не задан" },
        { status: 400 },
      );
    } else {
      results.wazzup = { skipped: true, reason: "WAZZUP_API_KEY не задан" };
    }
  }

  if (source === "max" || source === "all") {
    results.max = await syncAllMaxHistory({
      chatIds: body.chatIds,
    });
  }

  return NextResponse.json({ ok: true, results });
}
