import { NextResponse } from "next/server";
import { ALL_CHANNELS } from "@/lib/channels";
import { dismissAllAwaitingReplies } from "@/lib/store";
import type { Channel } from "@/lib/types";

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const channelParam = searchParams.get("channel");

  let channel: Channel | "all" = "all";
  if (channelParam && channelParam !== "all") {
    if (!ALL_CHANNELS.includes(channelParam as Channel)) {
      return NextResponse.json({ error: "Неизвестный канал" }, { status: 400 });
    }
    channel = channelParam as Channel;
  }

  const dismissed = dismissAllAwaitingReplies(channel);

  return NextResponse.json({ ok: true, dismissed });
}
