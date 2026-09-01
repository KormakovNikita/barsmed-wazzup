import { NextResponse } from "next/server";
import { getIntegrationStatus } from "@/lib/integrations";
import {
  deleteMaxWebhook,
  isMaxConfigured,
  listMaxSubscriptions,
  registerMaxWebhook,
} from "@/lib/integrations/max";
import {
  deleteTelegramWebhook,
  getTelegramMode,
  isTelegramConfigured,
  registerWazzupWebhook,
  setTelegramWebhook,
} from "@/lib/integrations/telegram";
import { getMaxIncomingMode, getMaxWebhookBaseUrl, getWazzupWebhookBaseUrl, isMaxIncomingConfigured } from "@/lib/integrations/wazzup-max";
import { getAssignmentStrategy, getOperatorLoad } from "@/lib/assignment";
import { listConversations, listOperators } from "@/lib/store";

export async function GET() {
  const operators = listOperators();
  const conversations = listConversations();
  const operatorLoad = getOperatorLoad(operators, conversations);
  const integrations = await getIntegrationStatus();

  return NextResponse.json({
    ...integrations,
    assignmentStrategy: getAssignmentStrategy(),
    operatorLoad,
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { action?: string; url?: string };
  const baseUrl = process.env.WEBHOOK_BASE_URL;
  const maxWebhookBase = getMaxWebhookBaseUrl();
  const wazzupWebhookBase = getWazzupWebhookBaseUrl();

  if (body.action === "list-max-subscriptions") {
    const result = await listMaxSubscriptions();
    return NextResponse.json(result);
  }

  if (body.action === "delete-max-webhook") {
    if (!body.url) {
      return NextResponse.json({ error: "url обязателен" }, { status: 400 });
    }
    const result = await deleteMaxWebhook(body.url);
    return NextResponse.json(result);
  }

  if (body.action === "clear-max-webhooks") {
    const listed = await listMaxSubscriptions();
    if (!listed.ok || !listed.subscriptions?.length) {
      return NextResponse.json({ ok: true, deleted: [] });
    }

    const deleted: { url: string; ok: boolean; error?: string }[] = [];
    for (const sub of listed.subscriptions) {
      const result = await deleteMaxWebhook(sub.url);
      deleted.push({ url: sub.url, ...result });
    }

    return NextResponse.json({ ok: true, deleted });
  }

  if (body.action === "clear-telegram-webhook") {
    await deleteTelegramWebhook();
    return NextResponse.json({ ok: true });
  }

  if (body.action === "register-wazzup-webhook") {
    if (!wazzupWebhookBase) {
      return NextResponse.json(
        { error: "WAZZUP_WEBHOOK_BASE_URL или WEBHOOK_BASE_URL не задан" },
        { status: 400 },
      );
    }
    const result = await registerWazzupWebhook(`${wazzupWebhookBase}/api/webhooks/wazzup`);
    return NextResponse.json(result);
  }

  if (body.action === "register-webhooks") {
    if (!baseUrl && !maxWebhookBase && !wazzupWebhookBase) {
      return NextResponse.json(
        { error: "WEBHOOK_BASE_URL не задан" },
        { status: 400 },
      );
    }

    const results: Record<string, { ok: boolean; error?: string }> = {};

    if (getTelegramMode() === "bot" && isTelegramConfigured() && baseUrl) {
      results.telegram = await setTelegramWebhook(
        `${baseUrl}/api/webhooks/telegram`,
      );
    }

    if (getTelegramMode() === "wazzup" && wazzupWebhookBase) {
      results.wazzup = await registerWazzupWebhook(
        `${wazzupWebhookBase}/api/webhooks/wazzup`,
      );
    }

    if (isMaxIncomingConfigured()) {
      if (getMaxIncomingMode() === "wazzup" && process.env.WAZZUP_API_KEY && wazzupWebhookBase) {
        results.wazzupMax = await registerWazzupWebhook(
          `${wazzupWebhookBase}/api/webhooks/wazzup`,
        );
      } else if (maxWebhookBase) {
        results.max = await registerMaxWebhook(`${maxWebhookBase}/api/webhooks/max`);
      } else {
        results.max = { ok: true };
      }
    }

    return NextResponse.json({ ok: true, results });
  }

  if (body.action === "unregister-webhooks") {
    await deleteTelegramWebhook();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
