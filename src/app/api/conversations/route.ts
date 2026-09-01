import { NextResponse } from "next/server";
import {
  listConversations,
  searchConversations,
  getContactForConversation,
} from "@/lib/store";
import type { Channel } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const channel = searchParams.get("channel") as Channel | "all" | null;
  const query = searchParams.get("q")?.trim() ?? "";

  const conversations = (
    query
      ? searchConversations(query, channel ?? "all")
      : listConversations(channel ?? "all")
  ).map((conv) => ({
    ...conv,
    contact: getContactForConversation(conv.contactId),
  }));

  return NextResponse.json({ conversations });
}
