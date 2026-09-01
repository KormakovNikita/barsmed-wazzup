import type { ProxyInterface } from "teleproto/network/connection/TCPMTProxy";
import { getSetting } from "@/lib/settings-store";

export function parseTelegramProxyUrl(raw: string): ProxyInterface | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const socksType =
      url.protocol === "socks5:" ? 5 : url.protocol === "socks4:" ? 4 : null;
    if (!socksType) return null;

    const proxy: ProxyInterface = {
      socksType,
      ip: url.hostname,
      port: url.port ? Number(url.port) : socksType === 5 ? 1080 : 1080,
      timeout: 15,
    };

    if (url.username) {
      proxy.username = decodeURIComponent(url.username);
    }
    if (url.password) {
      proxy.password = decodeURIComponent(url.password);
    }

    return proxy;
  } catch {
    // host:port fallback
    const match = trimmed.match(
      /^(?:socks5?:\/\/)?(?:([^:@]+):([^@]+)@)?([^:]+):(\d+)$/i,
    );
    if (!match) return null;

    const [, user, pass, host, port] = match;
    return {
      socksType: trimmed.toLowerCase().includes("socks4") ? 4 : 5,
      ip: host,
      port: Number(port),
      timeout: 15,
      ...(user ? { username: user, password: pass ?? "" } : {}),
    };
  }
}

export function getTelegramProxy(): ProxyInterface | undefined {
  const fromEnv = process.env.TELEGRAM_PROXY?.trim();
  const fromSettings = getSetting("telegram_proxy")?.trim();
  const raw = fromEnv || fromSettings;
  if (!raw) return undefined;
  return parseTelegramProxyUrl(raw) ?? undefined;
}

export function getTelegramClientOptions() {
  const proxy = getTelegramProxy();
  return {
    connectionRetries: 8,
    timeout: 60,
    ...(proxy ? { proxy: { ...proxy, timeout: 60 } } : {}),
  };
}

export function maskProxyUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.password) url.password = "****";
    return url.toString();
  } catch {
    return raw.replace(/:([^:@]+)@/, ":****@");
  }
}
