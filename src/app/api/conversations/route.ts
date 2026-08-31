import { NextResponse } from "next/server";
import { listConversations, getContactForConversation } from "@/lib/store";
import type { Channel } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const channel = searchParams.get("channel") as Channel | "all" | null;

  const conversations = listConversations(channel ?? "all").map((conv) => ({
    ...conv,
    contact: getContactForConversation(conv.contactId),
  }));

  return NextResponse.json({ conversations });
}
