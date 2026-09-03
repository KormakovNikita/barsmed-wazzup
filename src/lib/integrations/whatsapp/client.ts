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
  clearWhatsAppSession,
} from "@/lib/integrations/whatsapp/session-path";
import { attachWhatsAppMessageHandler } from "@/lib/integrations/whatsapp/message-handler";
import {
  resolveLidToPhone,
  resolvePhoneToLid,
} from "@/lib/integrations/whatsapp/lid";
import { mergeDuplicateWhatsAppConversations } from "@/lib/store";

let socket: WASocket | null = null;
let listenerStarted = false;
let connecting: Promise<WASocket | null> | null = null;
let lastBootError: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let socketConnected = false;
let sessionLoggedOut = false;
let qrAuthInProgress = false;
let reconnectAttempt = 0;
let mergeDoneForSession = false;
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

function endSocketQuietly(sock: WASocket | null): void {
  if (!sock) return;
  try {
    sock.end(undefined);
  } catch {
    // ignore
  }
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
      reconnectAttempt = 0;
      ensureHandler(sock);
      console.info("[whatsapp] connection open");
      if (!hooks && !mergeDoneForSession) {
        mergeDoneForSession = true;
        void mergeDuplicateWhatsAppConversations(
          (lid) => resolveLidToPhone(sock, lid),
          (phone) => resolvePhoneToLid(sock, phone),
        )
          .then((merged) => {
            if (merged > 0) {
              console.info(
                `[whatsapp] synced ${merged} WhatsApp thread aliases`,
              );
            }
          })
          .catch((error) => {
            console.warn("[whatsapp] LID merge failed:", error);
          });
      }
      hooks?.onConnectionOpen?.();
    }

    if (connection === "close") {
      const wasCurrent = socket === sock;
      socketConnected = false;
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output
        ?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      const conflict = statusCode === DisconnectReason.connectionReplaced;
      sessionLoggedOut = loggedOut;
      const message =
        lastDisconnect?.error instanceof Error
          ? lastDisconnect.error.message
          : "Соединение WhatsApp закрыто";

      if (loggedOut) {
        lastBootError = "Сессия WhatsApp завершена. Войдите по QR снова.";
      } else if (conflict) {
        lastBootError =
          "Сессия WhatsApp занята другим подключением. Переподключение…";
      } else if (!getWhatsAppProxyUrl()) {
        lastBootError =
          "WhatsApp недоступен без WHATSAPP_PROXY (SOCKS5).";
      } else {
        lastBootError = message;
      }

      console.warn("[whatsapp] connection closed:", lastBootError ?? message);
      hooks?.onConnectionClose?.(lastBootError ?? message);

      if (wasCurrent) {
        socket = null;
        listenerStarted = false;
        mergeDoneForSession = false;
      }

      if (!hooks && wasCurrent && shouldReconnectAfterClose(statusCode) && isWhatsAppEnabled()) {
        // Conflict = another WA Web session replaced us. Back off hard so we
        // do not open a second socket while WhatsApp is still settling.
        const delay = conflict
          ? Math.min(60_000, 20_000 + reconnectAttempt * 15_000)
          : Math.min(30_000, 5_000 * Math.max(1, reconnectAttempt + 1));
        reconnectAttempt += 1;
        scheduleReconnect(delay);
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

function scheduleReconnect(delayMs = 5000): void {
  if (reconnectTimer || connecting || qrAuthInProgress) return;
  console.info(`[whatsapp] reconnect scheduled in ${delayMs}ms`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    listenerStarted = false;
    socketConnected = false;
    endSocketQuietly(socket);
    socket = null;
    void startWhatsAppListener();
  }, delayMs);
}

export function isWhatsAppSocketLive(): boolean {
  return Boolean(socket?.user && socketConnected && !sessionLoggedOut);
}

export function isWhatsAppReconnecting(): boolean {
  return Boolean(reconnectTimer || connecting);
}

export async function getWhatsAppSocket(): Promise<WASocket | null> {
  if (!isWhatsAppEnabled()) return null;

  if (isWhatsAppSocketLive()) {
    ensureHandler(socket!);
    return socket;
  }

  if (sessionLoggedOut) {
    lastBootError =
      lastBootError ??
      "Сессия WhatsApp завершена. Отсканируйте QR заново в настройках.";
    return null;
  }

  // Wait for scheduled reconnect instead of opening a competing socket.
  if (reconnectTimer) {
    lastBootError =
      lastBootError ?? "WhatsApp переподключается. Повторите через несколько секунд.";
    return null;
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
      endSocketQuietly(socket);
      socket = null;
      socketConnected = false;

      const instance = await createSocket(getWhatsAppSessionDir());
      socket = instance;
      await waitForConnectionOpen(instance);
      if (!socketConnected || socket !== instance) {
        lastBootError = lastBootError ?? "WhatsApp не подключён к серверу";
        endSocketQuietly(instance);
        if (socket === instance) socket = null;
        return null;
      }
      ensureHandler(instance);
      listenerStarted = true;
      return instance;
    } catch (error) {
      lastBootError =
        error instanceof Error ? error.message : "Ошибка подключения WhatsApp";
      console.error("[whatsapp] connect failed:", error);
      endSocketQuietly(socket);
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
  if (qrAuthInProgress) return;
  if (listenerStarted && socketConnected) return;
  if (reconnectTimer) return;
  if (connecting) {
    await connecting;
    return;
  }

  try {
    const active = await getWhatsAppSocket();
    if (!active?.user || !socketConnected) {
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
  mergeDoneForSession = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  endSocketQuietly(socket);
  socket = null;
  connecting = null;
}

export async function createWhatsAppQrSocket(hooks: {
  onQr: (qr: string) => void;
  onConnectionOpen: () => void;
  onConnectionClose: (error?: string) => void;
}): Promise<WASocket> {
  await resetWhatsAppClient();
  clearWhatsAppSession();
  sessionLoggedOut = false;
  lastBootError = null;
  reconnectAttempt = 0;
  qrAuthInProgress = true;

  if (!getWhatsAppProxyUrl()) {
    qrAuthInProgress = false;
    throw new Error(
      getWhatsAppProxyHint() ??
        "Задайте WHATSAPP_PROXY (SOCKS5). Telegram MTProxy для WhatsApp не используется.",
    );
  }

  try {
    return await createSocket(getWhatsAppSessionDir(), hooks);
  } catch (error) {
    qrAuthInProgress = false;
    throw error;
  }
}

export function finishWhatsAppQrAuth(): void {
  qrAuthInProgress = false;
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

  if (sessionLoggedOut) {
    return {
      enabled: true,
      configured,
      connected: false,
      proxyConfigured: true,
      proxySource: proxyInfo.source,
      proxyHint,
      profile: null,
      error:
        "Сессия WhatsApp завершена. Отсканируйте QR заново в настройках.",
    };
  }

  if (isWhatsAppSocketLive() && socket?.user) {
    const user = socket.user;
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
  }

  if (
    configured &&
    !listenerStarted &&
    !connecting &&
    !qrAuthInProgress &&
    !reconnectTimer
  ) {
    void startWhatsAppListener();
  }

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
      (connecting || reconnectTimer || listenerStarted
        ? "Подключение WhatsApp…"
        : configured
          ? "Сессия есть, но подключение не удалось. Проверьте WHATSAPP_PROXY."
          : "Подключите WhatsApp по QR-коду."),
  };
}
