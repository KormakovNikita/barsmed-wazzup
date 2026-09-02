import type { Agent as HttpsAgent } from "node:https";
import type { Boom } from "@hapi/boom";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
import {
  createWhatsAppProxyAgent,
  getWhatsAppProxyUrl,
  isWhatsAppProxyConfigured,
} from "@/lib/integrations/whatsapp/proxy";
import {
  ensureWhatsAppSessionDir,
  getWhatsAppSessionDir,
  hasWhatsAppSession,
  isWhatsAppEnabled,
} from "@/lib/integrations/whatsapp/session-path";
import { attachWhatsAppMessageHandler } from "@/lib/integrations/whatsapp/message-handler";

let socket: WASocket | null = null;
let listenerStarted = false;
let connecting: Promise<WASocket | null> | null = null;
let lastBootError: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const silentLogger = pino({ level: "silent" });

function getSocketOptions(authFolder: string) {
  const agent = createWhatsAppProxyAgent();
  return {
    authFolder,
    agent,
    fetchAgent: agent,
  };
}

async function createSocket(
  authFolder: string,
  hooks?: {
    onQr?: (qr: string) => void;
    onConnectionOpen?: () => void;
    onConnectionClose?: (error?: string) => void;
  },
): Promise<WASocket> {
  ensureWhatsAppSessionDir();
  const { state, saveCreds } = await useMultiFileAuthState(authFolder);
  const agent = createWhatsAppProxyAgent();

  const sock = makeWASocket({
    auth: state,
    logger: silentLogger,
    browser: ["БАРСМЕД", "Chrome", "120.0.0"],
    markOnlineOnConnect: false,
    syncFullHistory: false,
    ...(agent ? { agent, fetchAgent: agent } : {}),
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && hooks?.onQr) {
      hooks.onQr(qr);
    }

    if (connection === "open") {
      lastBootError = null;
      hooks?.onConnectionOpen?.();
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output
        ?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      const message =
        lastDisconnect?.error instanceof Error
          ? lastDisconnect.error.message
          : "Соединение WhatsApp закрыто";

      if (loggedOut) {
        lastBootError = "Сессия WhatsApp завершена. Войдите по QR снова.";
      } else if (!getWhatsAppProxyUrl()) {
        lastBootError =
          "WhatsApp недоступен без прокси. Задайте WHATSAPP_PROXY (VPN).";
      } else {
        lastBootError = message;
      }

      hooks?.onConnectionClose?.(lastBootError ?? message);

      if (!hooks && !loggedOut && isWhatsAppEnabled()) {
        scheduleReconnect();
      }
    }
  });

  if (!hooks) {
    attachWhatsAppMessageHandler(sock);
  }

  return sock;
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void startWhatsAppListener();
  }, 5000);
}

export async function getWhatsAppSocket(): Promise<WASocket | null> {
  if (!isWhatsAppEnabled()) return null;
  if (socket && socket.user) return socket;
  if (connecting) return connecting;

  connecting = (async () => {
    if (!hasWhatsAppSession()) {
      lastBootError = "Сессия WhatsApp не найдена. Подключите по QR.";
      return null;
    }

    if (!getWhatsAppProxyUrl()) {
      lastBootError =
        "Для WhatsApp в РФ нужен прокси (VPN). Задайте WHATSAPP_PROXY в настройках.";
      return null;
    }

    try {
      if (socket) {
        try {
          socket.end(undefined);
        } catch {
          // ignore
        }
        socket = null;
      }

      const instance = await createSocket(getWhatsAppSessionDir());
      socket = instance;
      return instance;
    } catch (error) {
      lastBootError =
        error instanceof Error ? error.message : "Ошибка подключения WhatsApp";
      console.error("[whatsapp] connect failed:", error);
      return null;
    }
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

export async function startWhatsAppListener(): Promise<void> {
  if (listenerStarted || !isWhatsAppEnabled()) return;
  listenerStarted = true;

  try {
    const active = await getWhatsAppSocket();
    if (!active?.user) {
      listenerStarted = false;
      console.warn("[whatsapp] listener not started:", lastBootError);
      return;
    }
    console.info("[whatsapp] listener started");
  } catch (error) {
    listenerStarted = false;
    console.error("[whatsapp] failed to start listener:", error);
  }
}

export async function resetWhatsAppClient(): Promise<void> {
  listenerStarted = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    try {
      socket.end(undefined);
    } catch {
      // ignore
    }
  }
  socket = null;
  connecting = null;
}

export async function createWhatsAppQrSocket(hooks: {
  onQr: (qr: string) => void;
  onConnectionOpen: () => void;
  onConnectionClose: (error?: string) => void;
}): Promise<WASocket> {
  await resetWhatsAppClient();
  if (!getWhatsAppProxyUrl()) {
    throw new Error(
      "Сначала задайте SOCKS5/HTTP прокси (VPN). WhatsApp в РФ без VPN не работает.",
    );
  }
  return createSocket(getWhatsAppSessionDir(), hooks);
}

export async function getWhatsAppStatus(): Promise<{
  enabled: boolean;
  configured: boolean;
  connected: boolean;
  proxyConfigured: boolean;
  profile: { id?: string; name?: string; phone?: string } | null;
  error?: string | null;
}> {
  if (!isWhatsAppEnabled()) {
    return {
      enabled: false,
      configured: false,
      connected: false,
      proxyConfigured: isWhatsAppProxyConfigured(),
      profile: null,
    };
  }

  const proxyConfigured = isWhatsAppProxyConfigured();
  const configured = hasWhatsAppSession();

  if (!proxyConfigured) {
    return {
      enabled: true,
      configured,
      connected: false,
      proxyConfigured: false,
      profile: null,
      error:
        "Задайте прокси (VPN): SOCKS5 или HTTP. Без него WhatsApp в России недоступен.",
    };
  }

  try {
    const active = await getWhatsAppSocket();
    if (!active?.user) {
      return {
        enabled: true,
        configured,
        connected: false,
        proxyConfigured: true,
        profile: null,
        error:
          lastBootError ??
          (configured
            ? "Сессия есть, но подключение не удалось. Попробуйте QR снова."
            : "Подключите WhatsApp по QR-коду."),
      };
    }

    const user = active.user;
    const name = user.name ?? user.verifiedName ?? "WhatsApp Business";
    return {
      enabled: true,
      configured: true,
      connected: true,
      proxyConfigured: true,
      profile: {
        id: user.id.split(":")[0] ?? user.id,
        name,
        phone: user.id.split(":")[0],
      },
    };
  } catch (error) {
    return {
      enabled: true,
      configured,
      connected: false,
      proxyConfigured: true,
      profile: null,
      error: error instanceof Error ? error.message : "Ошибка WhatsApp",
    };
  }
}

export { getSocketOptions };
