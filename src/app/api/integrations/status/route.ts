import { NextResponse } from "next/server";
import { getIntegrationStatus } from "@/lib/integrations";
import {
  isMaxConfigured,
  registerMaxWebhook,
} from "@/lib/integrations/max";
import {
  deleteTelegramWebhook,
  isTelegramConfigured,
  setTelegramWebhook,
} from "@/lib/integrations/telegram";
import { getAssignmentStrategy, getOperatorLoad } from "@/lib/assignment";
import { listConversations, listOperators } from "@/lib/store";

export async function GET() {
  const operators = listOperators();
  const conversations = listConversations();
  const operatorLoad = getOperatorLoad(operators, conversations);

  return NextResponse.json({
    ...getIntegrationStatus(),
    assignmentStrategy: getAssignmentStrategy(),
    operatorLoad,
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { action?: string };
  const baseUrl = process.env.WEBHOOK_BASE_URL;

  if (body.action === "register-webhooks") {
    if (!baseUrl) {
      return NextResponse.json(
        { error: "WEBHOOK_BASE_URL не задан" },
        { status: 400 },
      );
    }

    const results: Record<string, { ok: boolean; error?: string }> = {};

    if (isTelegramConfigured()) {
      results.telegram = await setTelegramWebhook(
        `${baseUrl}/api/webhooks/telegram`,
      );
    }

    if (isMaxConfigured()) {
      results.max = await registerMaxWebhook(`${baseUrl}/api/webhooks/max`);
    }

    return NextResponse.json({ ok: true, results });
  }

  if (body.action === "unregister-webhooks") {
    await deleteTelegramWebhook();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
