import type { ProxyInterface } from "teleproto/network/connection/TCPMTProxy";
import { getSetting } from "@/lib/settings-store";

function parseMtProxyLink(raw: string): ProxyInterface | null {
  const trimmed = raw.trim();

  // tg://proxy?server=...&port=...&secret=...
  // https://t.me/proxy?server=...&port=...&secret=...
  if (trimmed.includes("proxy?") || trimmed.startsWith("tg://")) {
    try {
      const url = trimmed.startsWith("tg://")
        ? new URL(trimmed.replace("tg://", "https://"))
        : new URL(trimmed);
      const server = url.searchParams.get("server");
      const port = url.searchParams.get("port");
      const secret = url.searchParams.get("secret");
      if (!server || !port || !secret) return null;
      return {
        MTProxy: true,
        ip: server,
        port: Number(port),
        secret,
        timeout: 60,
      };
    } catch {
      return null;
    }
  }

  // mtproxy://host:port:secret
  const mtMatch = trimmed.match(/^mtproxy:\/\/([^:]+):(\d+):(.+)$/i);
  if (mtMatch) {
    return {
      MTProxy: true,
      ip: mtMatch[1],
      port: Number(mtMatch[2]),
      secret: mtMatch[3],
      timeout: 60,
    };
  }

  return null;
}

export function parseTelegramProxyUrl(raw: string): ProxyInterface | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const mtProxy = parseMtProxyLink(trimmed);
  if (mtProxy) return mtProxy;

  try {
    const url = new URL(trimmed);
    const socksType =
      url.protocol === "socks5:" ? 5 : url.protocol === "socks4:" ? 4 : null;
    if (!socksType) return null;

    const proxy: ProxyInterface = {
      socksType,
      ip: url.hostname,
      port: url.port ? Number(url.port) : 1080,
      timeout: 60,
    };

    if (url.username) {
      proxy.username = decodeURIComponent(url.username);
    }
    if (url.password) {
      proxy.password = decodeURIComponent(url.password);
    }

    return proxy;
  } catch {
    const match = trimmed.match(
      /^(?:socks5?:\/\/)?(?:([^:@]+):([^@]+)@)?([^:]+):(\d+)$/i,
    );
    if (!match) return null;

    const [, user, pass, host, port] = match;
    return {
      socksType: trimmed.toLowerCase().includes("socks4") ? 4 : 5,
      ip: host,
      port: Number(port),
      timeout: 60,
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
  const mt = parseMtProxyLink(raw);
  if (mt && "secret" in mt) {
    return raw.replace(/secret=[^&]+/, "secret=****");
  }
  try {
    const url = new URL(raw);
    if (url.password) url.password = "****";
    return url.toString();
  } catch {
    return raw.replace(/:([^:@]+)@/, ":****@");
  }
}
