import {
  findOrCreateMaxConversation,
  importHistoricalMessages,
  registerMaxKnownChat,
} from "@/lib/store";

const WAZZUP_API = "https://api.wazzup24.com";

export function isWazzupConfigured(): boolean {
  return Boolean(process.env.WAZZUP_API_KEY);
}

function wazzupHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.WAZZUP_API_KEY}`,
    "Content-Type": "application/json",
  };
}

interface WazzupChannel {
  channelId: string;
  transport: string;
  plainId?: string;
  state?: string;
}

export async function findWazzupMaxChannelId(): Promise<string | null> {
  const configured = process.env.WAZZUP_MAX_CHANNEL_ID;
  if (configured) return configured;

  const response = await fetch(`${WAZZUP_API}/v3/channels`, {
    headers: wazzupHeaders(),
    cache: "no-store",
  });

  if (!response.ok) return null;

  const data = (await response.json()) as WazzupChannel[] | { data?: WazzupChannel[] };
  const channels = Array.isArray(data) ? data : (data.data ?? []);

  const maxChannel = channels.find(
    (ch) =>
      (ch.transport === "max" || ch.transport === "maxbot") &&
      ch.state === "active",
  );

  return maxChannel?.channelId ?? channels.find((ch) => ch.transport === "max" || ch.transport === "maxbot")?.channelId ?? null;
}

async function createMessagesDump(
  channelId: string,
  startAt: string,
  endAt: string,
): Promise<string | null> {
  const response = await fetch(`${WAZZUP_API}/v2/messages/messages_dump`, {
    method: "POST",
    headers: wazzupHeaders(),
    body: JSON.stringify({
      start_at: startAt,
      end_at: endAt,
      channel_id: channelId,
    }),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as {
    data?: { export_id?: string };
  };

  return data.data?.export_id ?? null;
}

async function waitForDumpUrl(exportId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await fetch(
      `${WAZZUP_API}/v2/messages/messages_dump/${exportId}`,
      { headers: wazzupHeaders(), cache: "no-store" },
    );

    if (!response.ok) return null;

    const data = (await response.json()) as {
      data?: { status?: string; url?: string | null };
    };

    const status = data.data?.status;
    if ((status === "done" || status === "webhook_failed") && data.data?.url) {
      return data.data.url;
    }

    if (status === "done" || status === "webhook_failed") {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  return null;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  result.push(current.trim());
  return result;
}

function pickColumn(headers: string[], names: string[]): number {
  const lower = headers.map((h) => h.toLowerCase());
  for (const name of names) {
    const idx = lower.indexOf(name.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseWazzupCsv(csv: string): Array<{
  chatId: string;
  chatType: string;
  text: string;
  createdAt: string;
  direction: "in" | "out";
  contactName?: string;
}> {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const chatIdIdx = pickColumn(headers, ["chat_id", "chatid", "chat"]);
  const chatTypeIdx = pickColumn(headers, ["chat_type", "chattype", "type"]);
  const textIdx = pickColumn(headers, ["text", "message", "body", "content"]);
  const dateIdx = pickColumn(headers, [
    "date",
    "datetime",
    "created_at",
    "timestamp",
    "time",
  ]);
  const dirIdx = pickColumn(headers, ["direction", "type_message", "message_type"]);
  const nameIdx = pickColumn(headers, ["contact_name", "name", "username"]);

  if (chatIdIdx < 0 || textIdx < 0) return [];

  const rows: Array<{
    chatId: string;
    chatType: string;
    text: string;
    createdAt: string;
    direction: "in" | "out";
    contactName?: string;
  }> = [];

  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const chatType = chatTypeIdx >= 0 ? cols[chatTypeIdx] ?? "" : "max";
    if (!chatType.includes("max")) continue;

    const chatId = cols[chatIdIdx];
    const text = cols[textIdx];
    if (!chatId || !text) continue;

    const rawDir = dirIdx >= 0 ? cols[dirIdx]?.toLowerCase() ?? "" : "";
    const direction =
      rawDir.includes("out") ||
      rawDir.includes("sent") ||
      rawDir.includes("исход")
        ? "out"
        : "in";

    let createdAt = new Date().toISOString();
    if (dateIdx >= 0 && cols[dateIdx]) {
      const parsed = new Date(cols[dateIdx]);
      if (!Number.isNaN(parsed.getTime())) {
        createdAt = parsed.toISOString();
      }
    }

    rows.push({
      chatId,
      chatType,
      text,
      createdAt,
      direction,
      contactName: nameIdx >= 0 ? cols[nameIdx] : undefined,
    });
  }

  return rows;
}

export async function importWazzupMaxHistory(options?: {
  yearsBack?: number;
}): Promise<{
  ok: boolean;
  chats: number;
  imported: number;
  skipped: number;
  error?: string;
}> {
  if (!isWazzupConfigured()) {
    return {
      ok: false,
      chats: 0,
      imported: 0,
      skipped: 0,
      error: "WAZZUP_API_KEY не задан",
    };
  }

  const channelId = await findWazzupMaxChannelId();
  if (!channelId) {
    return {
      ok: false,
      chats: 0,
      imported: 0,
      skipped: 0,
      error: "Не найден активный MAX-канал в Wazzup",
    };
  }

  const yearsBack = options?.yearsBack ?? 3;
  const endAt = new Date().toISOString();
  const startAt = new Date(
    Date.now() - yearsBack * 365 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const exportId = await createMessagesDump(channelId, startAt, endAt);
  if (!exportId) {
    return {
      ok: false,
      chats: 0,
      imported: 0,
      skipped: 0,
      error: "Не удалось создать выгрузку в Wazzup",
    };
  }

  const url = await waitForDumpUrl(exportId);
  if (!url) {
    return {
      ok: false,
      chats: 0,
      imported: 0,
      skipped: 0,
      error: "Wazzup не вернул ссылку на выгрузку (таймаут)",
    };
  }

  const csvResponse = await fetch(url);
  if (!csvResponse.ok) {
    return {
      ok: false,
      chats: 0,
      imported: 0,
      skipped: 0,
      error: "Не удалось скачать CSV из Wazzup",
    };
  }

  const csv = await csvResponse.text();
  const rows = parseWazzupCsv(csv);

  const byChat = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!byChat.has(row.chatId)) byChat.set(row.chatId, []);
    byChat.get(row.chatId)!.push(row);
  }

  let imported = 0;
  let skipped = 0;

  for (const [chatId, chatRows] of byChat) {
    chatRows.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    const firstIn = chatRows.find((r) => r.direction === "in");
    registerMaxKnownChat({
      chatId,
      contactName: firstIn?.contactName ?? "Клиент MAX",
      source: "wazzup",
    });

    const conversation = findOrCreateMaxConversation({
      chatId,
      senderName: firstIn?.contactName ?? "Клиент MAX",
      preview: chatRows[chatRows.length - 1]?.text ?? "",
    });

    const result = importHistoricalMessages(
      conversation.id,
      chatRows.map((row, index) => ({
        externalId: `wazzup-${chatId}-${index}-${row.createdAt}`,
        content: row.text,
        direction: row.direction,
        createdAt: row.createdAt,
      })),
    );

    imported += result.imported;
    skipped += result.skipped;
  }

  return { ok: true, chats: byChat.size, imported, skipped };
}
