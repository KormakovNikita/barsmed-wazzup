import { existsSync } from "fs";
import { join } from "path";
import {
  messageHasVoice,
  processMaxProxyVoiceMessage,
} from "@/lib/integrations/max-proxy/message-handler";
import {
  ensureMaxProxySessionDir,
  getMaxProxySessionName,
  isMaxProxyEnabled,
} from "@/lib/integrations/max-proxy/session-path";
import { listMaxKnownChatIds } from "@/lib/store";
import { WebMaxClient, type MaxProxyMessage } from "webmaxsocket";

let client: WebMaxClient | null = null;
let listenerStarted = false;
let connecting: Promise<WebMaxClient | null> | null = null;
let historyPoller: ReturnType<typeof setInterval> | null = null;
const processedProxyIds = new Set<string>();

function rememberProcessed(messageId: string): boolean {
  if (processedProxyIds.has(messageId)) return true;
  processedProxyIds.add(messageId);
  if (processedProxyIds.size > 5000) {
    const first = processedProxyIds.values().next().value;
    if (first) processedProxyIds.delete(first);
  }
  return false;
}

export function hasMaxProxySession(): boolean {
  ensureMaxProxySessionDir();
  const sessionFile = join(
    process.cwd(),
    "sessions",
    `${getMaxProxySessionName()}.json`,
  );
  return existsSync(sessionFile);
}

export async function getMaxProxyClient(): Promise<WebMaxClient | null> {
  if (!isMaxProxyEnabled()) return null;
  if (client?.isAuthorized) return client;
  if (connecting) return connecting;

  connecting = (async () => {
    ensureMaxProxySessionDir();
    if (!hasMaxProxySession()) return null;

    const instance = new WebMaxClient({
      name: getMaxProxySessionName(),
      incomingLogMode: "off",
      saveToken: true,
    });

    await instance.start();
    client = instance;
    return instance;
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

async function handleProxyMessage(message: MaxProxyMessage): Promise<void> {
  if (!messageHasVoice(message)) return;
  const messageId = message.id != null ? String(message.id) : null;
  if (!messageId || rememberProcessed(messageId)) return;

  const activeClient = client;
  if (!activeClient) return;

  await processMaxProxyVoiceMessage(activeClient, message);
}

async function pollKnownChatVoiceHistory(activeClient: WebMaxClient): Promise<void> {
  const chatIds = listMaxKnownChatIds();
  for (const chatId of chatIds.slice(0, 40)) {
    try {
      const history = await activeClient.getHistory(chatId, undefined, 0, 12);
      for (const message of history) {
        await handleProxyMessage(message);
      }
    } catch (error) {
      console.error("[max-proxy] history poll failed for chat", chatId, error);
    }
  }
}

export async function startMaxProxyListener(): Promise<void> {
  if (listenerStarted || !isMaxProxyEnabled()) return;
  listenerStarted = true;

  try {
    const activeClient = await getMaxProxyClient();
    if (!activeClient) {
      listenerStarted = false;
      return;
    }

    activeClient.onMessage((message) => {
      handleProxyMessage(message).catch((error) => {
        console.error("[max-proxy] message handler failed:", error);
      });
    });

    const pollMs = Number(process.env.MAX_PROXY_HISTORY_POLL_MS ?? 20000);
    historyPoller = setInterval(() => {
      pollKnownChatVoiceHistory(activeClient).catch((error) => {
        console.error("[max-proxy] history poller failed:", error);
      });
    }, pollMs);

    await pollKnownChatVoiceHistory(activeClient);
    console.info("[max-proxy] voice listener started");
  } catch (error) {
    listenerStarted = false;
    console.error("[max-proxy] failed to start:", error);
  }
}

export async function resetMaxProxyClient(): Promise<void> {
  listenerStarted = false;
  if (historyPoller) {
    clearInterval(historyPoller);
    historyPoller = null;
  }
  if (client) {
    try {
      await client.stop();
    } catch {
      // ignore
    }
  }
  client = null;
  connecting = null;
}

export async function getMaxProxyStatus(): Promise<{
  enabled: boolean;
  configured: boolean;
  connected: boolean;
  profile: { id?: number; name?: string } | null;
  error?: string | null;
}> {
  if (!isMaxProxyEnabled()) {
    return {
      enabled: false,
      configured: false,
      connected: false,
      profile: null,
    };
  }

  const configured = hasMaxProxySession();

  try {
    const activeClient = await getMaxProxyClient();
    if (!activeClient) {
      return {
        enabled: true,
        configured,
        connected: false,
        profile: null,
        error: configured ? "Сессия есть, но подключение не удалось" : null,
      };
    }

    const me = activeClient.me;
    const name = [me?.firstname, me?.lastname].filter(Boolean).join(" ").trim();
    return {
      enabled: true,
      configured: true,
      connected: activeClient.isAuthorized,
      profile: me
        ? {
            id: me.id,
            name: name || "MAX аккаунт",
          }
        : null,
    };
  } catch (error) {
    return {
      enabled: true,
      configured,
      connected: false,
      profile: null,
      error: error instanceof Error ? error.message : "Ошибка MAX Proxy",
    };
  }
}

export function createMaxProxyQrClient(): WebMaxClient {
  ensureMaxProxySessionDir();
  return new WebMaxClient({
    name: getMaxProxySessionName(),
    incomingLogMode: "off",
    saveToken: true,
  });
}
