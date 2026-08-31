import type { OutboundMessagePayload } from "@/lib/types";

const DEFAULT_MAX_API = "https://platform-api2.max.ru";

export function getMaxApiBase(): string {
  return process.env.MAX_API_BASE_URL ?? DEFAULT_MAX_API;
}

export function isMaxConfigured(): boolean {
  return Boolean(process.env.MAX_BOT_TOKEN);
}

export function getMaxBotToken(): string | null {
  return process.env.MAX_BOT_TOKEN ?? null;
}

function maxHeaders(): HeadersInit {
  const token = getMaxBotToken();
  return {
    Authorization: token ?? "",
    "Content-Type": "application/json",
  };
}

export async function sendMaxMessage(
  payload: OutboundMessagePayload,
): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  const token = getMaxBotToken();
  if (!token) {
    return { ok: false, error: "MAX_BOT_TOKEN не задан" };
  }

  const params = new URLSearchParams();
  if (/^\d+$/.test(payload.externalThreadId)) {
    if (payload.externalThreadId.length > 8) {
      params.set("chat_id", payload.externalThreadId);
    } else {
      params.set("user_id", payload.externalThreadId);
    }
  } else {
    params.set("user_id", payload.externalThreadId);
  }

  const response = await fetch(
    `${getMaxApiBase()}/messages?${params.toString()}`,
    {
      method: "POST",
      headers: maxHeaders(),
      body: JSON.stringify({ text: payload.content }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: text || `MAX API ${response.status}` };
  }

  const data = (await response.json()) as {
    message?: { body?: { mid?: string } };
  };

  return {
    ok: true,
    externalId: data.message?.body?.mid,
  };
}

export async function registerMaxWebhook(
  webhookUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = getMaxBotToken();
  if (!token) {
    return { ok: false, error: "MAX_BOT_TOKEN не задан" };
  }

  const secret = process.env.MAX_WEBHOOK_SECRET ?? "hubdesk-max-secret";
  const response = await fetch(`${getMaxApiBase()}/subscriptions`, {
    method: "POST",
    headers: maxHeaders(),
    body: JSON.stringify({
      url: webhookUrl,
      update_types: ["message_created", "bot_started"],
      secret,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: text || `MAX subscriptions ${response.status}` };
  }

  return { ok: true };
}

export async function listMaxSubscriptions(): Promise<{
  ok: boolean;
  subscriptions?: { url: string; update_types?: string[] }[];
  error?: string;
}> {
  const token = getMaxBotToken();
  if (!token) {
    return { ok: false, error: "MAX_BOT_TOKEN не задан" };
  }

  const response = await fetch(`${getMaxApiBase()}/subscriptions`, {
    headers: { Authorization: token },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: text || `MAX subscriptions ${response.status}` };
  }

  const data = (await response.json()) as {
    subscriptions?: { url: string; update_types?: string[] }[];
  };

  return { ok: true, subscriptions: data.subscriptions ?? [] };
}

export async function deleteMaxWebhook(
  webhookUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = getMaxBotToken();
  if (!token) {
    return { ok: false, error: "MAX_BOT_TOKEN не задан" };
  }

  const params = new URLSearchParams({ url: webhookUrl });
  const response = await fetch(`${getMaxApiBase()}/subscriptions?${params}`, {
    method: "DELETE",
    headers: { Authorization: token },
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: text || `MAX delete subscription ${response.status}` };
  }

  const data = (await response.json()) as { success?: boolean; message?: string };
  if (data.success === false) {
    return { ok: false, error: data.message ?? "Не удалось удалить webhook" };
  }

  return { ok: true };
}

export interface MaxUpdate {
  update_type: string;
  timestamp: number;
  chat_id?: number;
  user?: {
    user_id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  message?: {
    sender?: {
      user_id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      is_bot?: boolean;
    };
    recipient?: {
      chat_id?: number;
      user_id?: number;
      chat_type?: string;
    };
    body?: {
      mid?: string;
      text?: string;
    };
  };
}

export function parseMaxUpdate(update: MaxUpdate) {
  if (update.update_type === "bot_started" && update.user) {
    const name = [update.user.first_name, update.user.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    return {
      externalThreadId: String(update.user.user_id),
      externalMessageId: `max-start-${update.user.user_id}-${update.timestamp}`,
      content: "/start",
      senderName: name || update.user.username || "MAX user",
      senderUsername: update.user.username,
    };
  }

  if (update.update_type !== "message_created" || !update.message?.body?.text) {
    return null;
  }

  const sender = update.message.sender;
  if (!sender || sender.is_bot) return null;

  const threadId =
    update.message.recipient?.chat_id ??
    update.message.recipient?.user_id ??
    sender.user_id;

  const name = [sender.first_name, sender.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    externalThreadId: String(threadId),
    externalMessageId: `max-${update.message.body.mid ?? update.timestamp}`,
    content: update.message.body.text,
    senderName: name || sender.username || "MAX user",
    senderUsername: sender.username,
  };
}

export async function pollMaxUpdates(marker?: number): Promise<{
  updates: MaxUpdate[];
  nextMarker?: number;
}> {
  const token = getMaxBotToken();
  if (!token) return { updates: [] };

  const params = new URLSearchParams({ limit: "50", timeout: "0" });
  if (marker !== undefined) params.set("marker", String(marker));

  const response = await fetch(`${getMaxApiBase()}/updates?${params}`, {
    headers: { Authorization: token },
  });

  if (!response.ok) return { updates: [] };

  const data = (await response.json()) as {
    updates?: MaxUpdate[];
    marker?: number;
  };

  return {
    updates: data.updates ?? [],
    nextMarker: data.marker,
  };
}

export interface MaxBotInfo {
  userId: number;
  name: string;
  username?: string;
  description?: string;
}

export async function getMaxBotInfo(): Promise<{
  ok: boolean;
  bot?: MaxBotInfo;
  error?: string;
}> {
  const token = getMaxBotToken();
  if (!token) {
    return { ok: false, error: "MAX_BOT_TOKEN не задан" };
  }

  const response = await fetch(`${getMaxApiBase()}/me`, {
    headers: { Authorization: token },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    return {
      ok: false,
      error: text || `MAX API ${response.status}`,
    };
  }

  const data = (await response.json()) as {
    user_id?: number;
    first_name?: string;
    username?: string;
    description?: string;
  };

  if (!data.user_id) {
    return { ok: false, error: "Некорректный ответ MAX API" };
  }

  return {
    ok: true,
    bot: {
      userId: data.user_id,
      name: data.first_name ?? "MAX Bot",
      username: data.username,
      description: data.description,
    },
  };
}

export function verifyMaxWebhookSecret(request: Request): boolean {
  const secret = process.env.MAX_WEBHOOK_SECRET;
  if (!secret) return true;

  const received = request.headers.get("X-Max-Bot-Api-Secret") ?? "";
  if (received.length !== secret.length) return false;

  let result = 0;
  for (let i = 0; i < secret.length; i++) {
    result |= received.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return result === 0;
}
