const VK_API = "https://api.vk.com/method";
const VK_VERSION = "5.199";

export interface VkApiError {
  error_code: number;
  error_msg: string;
}

interface VkApiResponse<T> {
  response?: T;
  error?: VkApiError;
}

async function vkMethod<T>(
  method: string,
  params: Record<string, string | number | undefined>,
  accessToken: string,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  search.set("access_token", accessToken);
  search.set("v", VK_VERSION);

  const response = await fetch(`${VK_API}/${method}?${search.toString()}`, {
    cache: "no-store",
  });
  const json = (await response.json()) as VkApiResponse<T>;

  if (json.error) {
    return {
      ok: false,
      error: `${json.error.error_msg} (${json.error.error_code})`,
    };
  }

  if (json.response === undefined) {
    return { ok: false, error: "Пустой ответ VK API" };
  }

  return { ok: true, data: json.response };
}

export interface VkLongPollServer {
  key: string;
  server: string;
  ts: string;
}

export async function resolveVkGroupId(
  groupIdOrScreenName: string,
  accessToken: string,
): Promise<
  | { ok: true; groupId: string; screenName?: string; name?: string }
  | { ok: false; error: string }
> {
  const trimmed = groupIdOrScreenName.trim();
  if (/^\d+$/.test(trimmed)) {
    return { ok: true, groupId: trimmed };
  }

  const result = await vkMethod<VkGroupInfo[]>(
    "groups.getById",
    { group_id: trimmed, fields: "screen_name" },
    accessToken,
  );
  if (!result.ok) return result;

  const group = result.data[0];
  if (!group) {
    return { ok: false, error: "Сообщество не найдено" };
  }

  return {
    ok: true,
    groupId: String(group.id),
    screenName: group.screen_name,
    name: group.name,
  };
}

export async function getVkLongPollServer(
  groupId: string,
  accessToken: string,
): Promise<
  { ok: true; server: VkLongPollServer } | { ok: false; error: string }
> {
  const result = await vkMethod<VkLongPollServer>(
    "groups.getLongPollServer",
    { group_id: groupId },
    accessToken,
  );
  if (!result.ok) return result;
  return { ok: true, server: result.data };
}

export interface VkGroupInfo {
  id: number;
  name: string;
  screen_name?: string;
}

export async function getVkGroupInfo(
  groupId: string,
  accessToken: string,
): Promise<
  { ok: true; group: VkGroupInfo } | { ok: false; error: string }
> {
  const result = await vkMethod<VkGroupInfo[]>(
    "groups.getById",
    { group_id: groupId, fields: "screen_name" },
    accessToken,
  );
  if (!result.ok) return result;
  const group = result.data[0];
  if (!group) {
    return { ok: false, error: "Сообщество не найдено" };
  }
  return { ok: true, group };
}

export interface VkUserInfo {
  id: number;
  first_name?: string;
  last_name?: string;
}

export async function getVkUsers(
  userIds: number[],
  accessToken: string,
): Promise<
  { ok: true; users: VkUserInfo[] } | { ok: false; error: string }
> {
  if (!userIds.length) return { ok: true, users: [] };
  const result = await vkMethod<VkUserInfo[]>(
    "users.get",
    { user_ids: userIds.join(",") },
    accessToken,
  );
  if (!result.ok) return result;
  return { ok: true, users: result.data };
}

export interface VkLongPollResponse {
  ts: string;
  updates: unknown[];
  failed?: number;
}

export async function pollVkLongPoll(
  server: VkLongPollServer,
): Promise<
  | { ok: true; data: VkLongPollResponse }
  | { ok: false; error: string; needRefresh?: boolean }
> {
  const url = new URL(server.server);
  url.searchParams.set("act", "a_check");
  url.searchParams.set("key", server.key);
  url.searchParams.set("ts", server.ts);
  url.searchParams.set("wait", "25");
  url.searchParams.set("mode", "2");
  url.searchParams.set("version", "3");

  try {
    const response = await fetch(url.toString(), { cache: "no-store" });
    if (!response.ok) {
      return {
        ok: false,
        error: `Long Poll HTTP ${response.status}`,
        needRefresh: true,
      };
    }

    const data = (await response.json()) as VkLongPollResponse;
    if (data.failed === 1) {
      return {
        ok: false,
        error: "Long Poll ts устарел",
        needRefresh: true,
      };
    }
    if (data.failed === 2 || data.failed === 3) {
      return {
        ok: false,
        error: "Long Poll key устарел",
        needRefresh: true,
      };
    }

    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Long Poll failed",
    };
  }
}

export async function sendVkApiMessage(params: {
  accessToken: string;
  peerId: number;
  message: string;
  replyTo?: number;
}): Promise<
  { ok: true; messageId: number } | { ok: false; error: string }
> {
  const randomId = Math.floor(Math.random() * 2_000_000_000);
  const result = await vkMethod<number>(
    "messages.send",
    {
      peer_id: params.peerId,
      message: params.message,
      random_id: randomId,
      reply_to: params.replyTo,
    },
    params.accessToken,
  );

  if (!result.ok) return result;
  return { ok: true, messageId: result.data };
}
