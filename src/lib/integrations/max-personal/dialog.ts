import { Opcode, type WebMaxClient } from "webmaxsocket";

interface MaxChatSummary {
  id?: number | string;
  lastEventTime?: number;
  participants?: Record<string, unknown>;
}

function chatHasParticipant(chat: MaxChatSummary, userId: string): boolean {
  const participants = chat.participants;
  if (!participants) return false;
  return participants[userId] != null;
}

export async function listMaxPersonalChats(
  client: WebMaxClient,
): Promise<MaxChatSummary[]> {
  const syncPayload = (
    client as WebMaxClient & {
      lastSyncPayload?: { chats?: MaxChatSummary[] };
    }
  ).lastSyncPayload;

  if (Array.isArray(syncPayload?.chats) && syncPayload.chats.length > 0) {
    return syncPayload.chats;
  }

  const fromApi = await client.getChats(0);
  return (fromApi as MaxChatSummary[] | undefined) ?? [];
}

export async function findMaxPersonalDialogChatId(
  client: WebMaxClient,
  userId: string,
): Promise<string | null> {
  const chats = await listMaxPersonalChats(client);
  const matches = chats.filter((chat) => chatHasParticipant(chat, userId));
  if (!matches.length) return null;

  matches.sort(
    (a, b) => Number(b.lastEventTime ?? 0) - Number(a.lastEventTime ?? 0),
  );
  return matches[0]?.id != null ? String(matches[0].id) : null;
}

export async function createMaxPersonalDialog(
  client: WebMaxClient,
  userId: string,
): Promise<string> {
  const numericUserId = Number(userId);
  if (!Number.isFinite(numericUserId)) {
    throw new Error("Некорректный user_id MAX");
  }

  const response = await client.sendAndWait(Opcode.MSG_SEND, {
    message: {
      text: "",
      elements: [],
      attaches: [
        {
          _type: "CONTROL",
          event: "new",
          chatType: "DIALOG",
          userIds: [numericUserId],
        },
      ],
    },
    notify: true,
  });

  const payload = response.payload as
    | {
        error?: string;
        localizedMessage?: string;
        message?: string;
        chatId?: number | string;
        chat?: { id?: number | string };
      }
    | undefined;

  if (payload?.error) {
    throw new Error(
      payload.localizedMessage ??
        payload.message ??
        String(payload.error),
    );
  }

  const chatId = payload?.chatId ?? payload?.chat?.id;
  if (chatId == null) {
    throw new Error("MAX не вернул id диалога");
  }

  return String(chatId);
}

export async function ensureMaxPersonalDialogChatId(
  client: WebMaxClient,
  userId: string,
): Promise<string> {
  try {
    await client.sync();
  } catch {
    // sync may fail when session expired; find/create will surface the error
  }

  const existing = await findMaxPersonalDialogChatId(client, userId);
  if (existing) return existing;
  return createMaxPersonalDialog(client, userId);
}
