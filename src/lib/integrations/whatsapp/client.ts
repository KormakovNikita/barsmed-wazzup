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
  getWhatsAppProxyHint,
  getWhatsAppProxyInfo,
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
let socketConnected = false;
let sessionLoggedOut = false;
const handlerAttached = new WeakSet<object>();

const silentLogger = pino({ level: "silent" });

function ensureHandler(sock: WASocket): void {
  if (handlerAttached.has(sock as object)) return;
  attachWhatsAppMessageHandler(sock);
  handlerAttached.add(sock as object);
}

function waitForConnectionOpen(sock: WASocket, timeoutMs = 45000): Promise<void> {
  if (socketConnected && socket === sock) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Таймаут подключения WhatsApp через прокси"));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      sock.ev.off("connection.update", onUpdate);
    };

    const onUpdate = (update: { connection?: string }) => {
      if (update.connection === "open") {
        cleanup();
        resolve();
      }
      if (update.connection === "close") {
        cleanup();
        reject(new Error(lastBootError ?? "Соединение WhatsApp закрыто"));
      }
    };

    sock.ev.on("connection.update", onUpdate);
  });
}

function shouldReconnectAfterClose(statusCode: number | undefined): boolean {
  if (statusCode == null) return true;
  return (
    statusCode !== DisconnectReason.loggedOut &&
    statusCode !== DisconnectReason.badSession &&
    statusCode !== DisconnectReason.forbidden &&
    statusCode !== DisconnectReason.multideviceMismatch
  );
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
      sessionLoggedOut = false;
      socketConnected = true;
      ensureHandler(sock);
      console.info("[whatsapp] connection open");
      hooks?.onConnectionOpen?.();
    }

    if (connection === "close") {
      socketConnected = false;
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output
        ?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      sessionLoggedOut = loggedOut;
      const message =
        lastDisconnect?.error instanceof Error
          ? lastDisconnect.error.message
          : "Соединение WhatsApp закрыто";

      if (loggedOut) {
        lastBootError = "Сессия WhatsApp завершена. Войдите по QR снова.";
      } else if (!getWhatsAppProxyUrl()) {
        lastBootError =
          "WhatsApp недоступен без WHATSAPP_PROXY (SOCKS5).";
      } else {
        lastBootError = message;
      }

      console.warn("[whatsapp] connection closed:", lastBootError ?? message);
      hooks?.onConnectionClose?.(lastBootError ?? message);

      if (!hooks && shouldReconnectAfterClose(statusCode) && isWhatsAppEnabled()) {
        scheduleReconnect();
      } else if (loggedOut) {
        listenerStarted = false;
        socket = null;
      }
    }
  });

  if (!hooks) {
    ensureHandler(sock);
  }

  return sock;
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    listenerStarted = false;
    socket = null;
    void startWhatsAppListener();
  }, 5000);
}

export async function getWhatsAppSocket(): Promise<WASocket | null> {
  if (!isWhatsAppEnabled()) return null;

  if (socket?.user && socketConnected) {
    ensureHandler(socket);
    return socket;
  }

  if (connecting) return connecting;

  connecting = (async () => {
    if (!hasWhatsAppSession()) {
      lastBootError = "Сессия WhatsApp не найдена. Подключите по QR.";
      return null;
    }

    if (!getWhatsAppProxyUrl()) {
      lastBootError =
        getWhatsAppProxyHint() ??
        "Задайте WHATSAPP_PROXY (SOCKS5) в .env.local или настройках.";
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
      await waitForConnectionOpen(instance);
      if (!socketConnected) {
        lastBootError = lastBootError ?? "WhatsApp не подключён к серверу";
        return null;
      }
      ensureHandler(instance);
      socket = instance;
      return instance;
    } catch (error) {
      lastBootError =
        error instanceof Error ? error.message : "Ошибка подключения WhatsApp";
      console.error("[whatsapp] connect failed:", error);
      socket = null;
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
  if (!isWhatsAppEnabled()) return;
  if (listenerStarted && socketConnected) return;

  try {
    const active = await getWhatsAppSocket();
    if (!active?.user) {
      listenerStarted = false;
      console.warn("[whatsapp] listener not started:", lastBootError);
      return;
    }
    listenerStarted = true;
    console.info("[whatsapp] listener started");
  } catch (error) {
    listenerStarted = false;
    console.error("[whatsapp] failed to start listener:", error);
  }
}

export async function restartWhatsAppListener(): Promise<void> {
  await resetWhatsAppClient();
  await startWhatsAppListener();
}

export async function resetWhatsAppClient(): Promise<void> {
  listenerStarted = false;
  socketConnected = false;
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
      getWhatsAppProxyHint() ??
        "Задайте WHATSAPP_PROXY (SOCKS5). Telegram MTProxy для WhatsApp не используется.",
    );
  }
  return createSocket(getWhatsAppSessionDir(), hooks);
}

export async function getWhatsAppStatus(): Promise<{
  enabled: boolean;
  configured: boolean;
  connected: boolean;
  proxyConfigured: boolean;
  proxySource: "whatsapp" | null;
  proxyHint: string | null;
  profile: { id?: string; name?: string; phone?: string } | null;
  error?: string | null;
}> {
  const proxyInfo = getWhatsAppProxyInfo();
  const proxyHint = getWhatsAppProxyHint();

  if (!isWhatsAppEnabled()) {
    return {
      enabled: false,
      configured: false,
      connected: false,
      proxyConfigured: isWhatsAppProxyConfigured(),
      proxySource: proxyInfo.source,
      proxyHint,
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
      proxySource: null,
      proxyHint,
      profile: null,
      error:
        proxyHint ??
        "Задайте WHATSAPP_PROXY (SOCKS5). Telegram MTProxy не подходит для WhatsApp.",
    };
  }

  try {
    const active = await getWhatsAppSocket();
    if (!active?.user || !socketConnected) {
      return {
        enabled: true,
        configured,
        connected: false,
        proxyConfigured: true,
        proxySource: proxyInfo.source,
        proxyHint,
        profile: null,
        error:
          lastBootError ??
          (sessionLoggedOut
            ? "Сессия WhatsApp завершена. Отсканируйте QR заново в настройках."
            : configured
              ? "Сессия есть, но подключение не удалось. Проверьте WHATSAPP_PROXY."
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
      proxySource: proxyInfo.source,
      proxyHint,
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
      proxySource: proxyInfo.source,
      proxyHint,
      profile: null,
      error: error instanceof Error ? error.message : "Ошибка WhatsApp",
    };
  }
}
