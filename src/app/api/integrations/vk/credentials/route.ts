import { NextResponse } from "next/server";
import { resolveVkGroupId } from "@/lib/integrations/vk/api";
import { deleteSetting, getSetting, setSetting } from "@/lib/settings-store";

function maskToken(token: string): string {
  if (token.length <= 8) return "••••••••";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

export async function GET() {
  const storedGroupId = getSetting("vk_group_id");
  const storedToken = getSetting("vk_access_token");
  const storedConfirmation = getSetting("vk_callback_confirmation");
  const storedSecret = getSetting("vk_callback_secret");

  const envGroupId = process.env.VK_GROUP_ID ?? "";
  const envToken = process.env.VK_ACCESS_TOKEN ?? "";

  return NextResponse.json({
    configured: Boolean(
      (storedGroupId || envGroupId) && (storedToken || envToken),
    ),
    groupId: storedGroupId ?? envGroupId,
    hasToken: Boolean(storedToken || envToken),
    tokenPreview:
      storedToken || envToken
        ? maskToken(storedToken ?? envToken)
        : null,
    hasConfirmation: Boolean(
      storedConfirmation || process.env.VK_CALLBACK_CONFIRMATION,
    ),
    hasSecret: Boolean(storedSecret || process.env.VK_CALLBACK_SECRET),
    source: storedGroupId ? "settings" : envGroupId ? "env" : null,
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    groupId?: string;
    accessToken?: string;
    callbackConfirmation?: string;
    callbackSecret?: string;
  };

  const groupId = body.groupId?.trim();
  const accessToken = body.accessToken?.trim();
  const callbackConfirmation = body.callbackConfirmation?.trim();
  const callbackSecret = body.callbackSecret?.trim();

  const existingToken =
    getSetting("vk_access_token") ?? process.env.VK_ACCESS_TOKEN ?? "";

  if (!groupId) {
    return NextResponse.json(
      { error: "ID сообщества обязателен" },
      { status: 400 },
    );
  }

  if (!accessToken && !existingToken) {
    return NextResponse.json(
      { error: "Ключ доступа обязателен" },
      { status: 400 },
    );
  }

  const token = accessToken || existingToken;
  const resolved = await resolveVkGroupId(groupId, token);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }

  setSetting("vk_group_id", resolved.groupId);
  if (accessToken) {
    setSetting("vk_access_token", accessToken);
  }

  if (callbackConfirmation) {
    setSetting("vk_callback_confirmation", callbackConfirmation);
  }
  if (callbackSecret) {
    setSetting("vk_callback_secret", callbackSecret);
  }

  return NextResponse.json({
    ok: true,
    groupId: resolved.groupId,
    screenName: resolved.screenName ?? null,
    name: resolved.name ?? null,
  });
}

export async function DELETE() {
  deleteSetting("vk_group_id");
  deleteSetting("vk_access_token");
  deleteSetting("vk_callback_confirmation");
  deleteSetting("vk_callback_secret");
  return NextResponse.json({ ok: true });
}
