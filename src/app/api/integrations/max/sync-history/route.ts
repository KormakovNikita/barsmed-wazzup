import { NextResponse } from "next/server";
import { isMaxConfigured } from "@/lib/integrations/max";
import { syncAllMaxHistory, syncMaxChatHistory } from "@/lib/integrations/max-history";

export async function POST(request: Request) {
  if (!isMaxConfigured()) {
    return NextResponse.json(
      { error: "MAX_BOT_TOKEN не задан" },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    chatId?: string;
    chatIds?: string[];
  };

  if (body.chatId) {
    const result = await syncMaxChatHistory(body.chatId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json(result);
  }

  const result = await syncAllMaxHistory({ chatIds: body.chatIds });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const totals = result.synced.reduce(
    (acc, item) => ({
      imported: acc.imported + item.imported,
      skipped: acc.skipped + item.skipped,
      totalFetched: acc.totalFetched + item.totalFetched,
    }),
    { imported: 0, skipped: 0, totalFetched: 0 },
  );

  return NextResponse.json({
    ok: true,
    conversations: result.synced.length,
    ...totals,
    details: result.synced,
  });
}
