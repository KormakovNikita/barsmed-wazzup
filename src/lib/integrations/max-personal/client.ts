import { processMaxPersonalMessage } from "@/lib/integrations/max-personal/message-handler";
import {
  ensureMaxPersonalSessionDir,
  getMaxPersonalSessionName,
  hasMaxPersonalSessionFile,
  isMaxPersonalEnabled,
} from "@/lib/integrations/max-personal/session-path";
import { WebMaxClient, type MaxProxyMessage } from "webmaxsocket";

let client: WebMaxClient | null = null;
let listenerStarted = false;
let connecting: Promise<WebMaxClient | null> | null = null;
const processedMessageIds = new Set<string>();

function rememberProcessed(messageId: string): boolean {
  if (processedMessageIds.has(messageId)) return true;
  processedMessageIds.add(messageId);
  if (processedMessageIds.size > 5000) {
    const first = processedMessageIds.values().next().value;
    if (first) processedMessageIds.delete(first);
  }
  return false;
}

export function hasMaxPersonalSession(): boolean {
  ensureMaxPersonalSessionDir();
  return hasMaxPersonalSessionFile();
}

export async function getMaxPersonalClient(): Promise<WebMaxClient | null> {
  if (!isMaxPersonalEnabled()) return null;
  if (client?.isAuthorized) {
    if (!client.isConnected) {
      try {
        await client.connect();
        if (!client.isConnected) {
          await resetMaxPersonalClient();
        } else {
          return client;
        }
      } catch {
        await resetMaxPersonalClient();
      }
    } else {
      return client;
    }
  }
  if (connecting) return connecting;

  connecting = (async () => {
    ensureMaxPersonalSessionDir();
    if (!hasMaxPersonalSessionFile()) return null;

    const instance = new WebMaxClient({
      name: getMaxPersonalSessionName(),
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

async function handlePersonalMessage(message: MaxProxyMessage): Promise<void> {
  const messageId = message.id != null ? String(message.id) : null;
  if (!messageId || rememberProcessed(messageId)) return;

  const activeClient = client;
  if (!activeClient) return;

  await processMaxPersonalMessage(activeClient, message);
}

export async function startMaxPersonalListener(): Promise<void> {
  if (listenerStarted || !isMaxPersonalEnabled()) return;
  listenerStarted = true;

  try {
    const activeClient = await getMaxPersonalClient();
    if (!activeClient) {
      listenerStarted = false;
      return;
    }

    activeClient.onMessage((message) => {
      handlePersonalMessage(message).catch((error) => {
        console.error("[max-personal] message handler failed:", error);
      });
    });

    console.info("[max-personal] listener started");
  } catch (error) {
    listenerStarted = false;
    console.error("[max-personal] failed to start:", error);
  }
}

export async function resetMaxPersonalClient(): Promise<void> {
  listenerStarted = false;
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

export async function getMaxPersonalStatus(): Promise<{
  enabled: boolean;
  configured: boolean;
  connected: boolean;
  profile: { id?: number; name?: string } | null;
  error?: string | null;
}> {
  if (!isMaxPersonalEnabled()) {
    return {
      enabled: false,
      configured: false,
      connected: false,
      profile: null,
    };
  }

  const configured = hasMaxPersonalSession();

  try {
    const activeClient = await getMaxPersonalClient();
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
            name: name || "MAX Personal",
          }
        : null,
    };
  } catch (error) {
    return {
      enabled: true,
      configured,
      connected: false,
      profile: null,
      error: error instanceof Error ? error.message : "Ошибка MAX Personal",
    };
  }
}

export function createMaxPersonalQrClient(): WebMaxClient {
  ensureMaxPersonalSessionDir();
  return new WebMaxClient({
    name: getMaxPersonalSessionName(),
    incomingLogMode: "off",
    saveToken: true,
  });
}
