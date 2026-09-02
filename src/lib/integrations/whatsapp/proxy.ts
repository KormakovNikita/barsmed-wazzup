import type { Agent as HttpsAgent } from "node:https";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import { getSetting } from "@/lib/settings-store";
import {
  parseTelegramProxyUrl,
} from "@/lib/integrations/telegram-user/proxy";

export type WhatsAppProxySource = "whatsapp" | "telegram" | null;

export function parseWhatsAppProxyUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^(socks[45]?|https?):\/\//i.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(
    /^(?:socks5?:\/\/)?(?:([^:@]+):([^@]+)@)?([^:]+):(\d+)$/i,
  );
  if (!match) return null;

  const [, user, pass, host, port] = match;
  const protocol = trimmed.toLowerCase().includes("socks4") ? "socks4" : "socks5";
  if (user) {
    return `${protocol}://${encodeURIComponent(user)}:${encodeURIComponent(pass ?? "")}@${host}:${port}`;
  }
  return `${protocol}://${host}:${port}`;
}

function telegramSocksToUrl(
  proxy: NonNullable<ReturnType<typeof parseTelegramProxyUrl>>,
): string | null {
  if ("MTProxy" in proxy && proxy.MTProxy) return null;
  if (!("socksType" in proxy) || !proxy.socksType || !proxy.ip || !proxy.port) {
    return null;
  }

  const protocol = proxy.socksType === 4 ? "socks4" : "socks5";
  if (proxy.username) {
    return `${protocol}://${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password ?? "")}@${proxy.ip}:${proxy.port}`;
  }
  return `${protocol}://${proxy.ip}:${proxy.port}`;
}

function getTelegramProxyRaw(): string | null {
  const fromEnv = process.env.TELEGRAM_PROXY?.trim();
  const fromSettings = getSetting("telegram_proxy")?.trim();
  return fromEnv || fromSettings || null;
}

function getWhatsAppProxyRaw(): string | null {
  const fromEnv = process.env.WHATSAPP_PROXY?.trim();
  const fromSettings = getSetting("whatsapp_proxy")?.trim();
  return fromEnv || fromSettings || null;
}

export function getWhatsAppProxyInfo(): {
  url: string | null;
  source: WhatsAppProxySource;
  telegramIsMtProxy: boolean;
} {
  const whatsappRaw = getWhatsAppProxyRaw();
  if (whatsappRaw) {
    return {
      url: parseWhatsAppProxyUrl(whatsappRaw) ?? whatsappRaw,
      source: "whatsapp",
      telegramIsMtProxy: false,
    };
  }

  const telegramRaw = getTelegramProxyRaw();
  if (!telegramRaw) {
    return { url: null, source: null, telegramIsMtProxy: false };
  }

  const telegramParsed = parseTelegramProxyUrl(telegramRaw);
  if (telegramParsed && "MTProxy" in telegramParsed && telegramParsed.MTProxy) {
    return { url: null, source: null, telegramIsMtProxy: true };
  }

  if (telegramParsed) {
    const url = telegramSocksToUrl(telegramParsed);
    if (url) {
      return { url, source: "telegram", telegramIsMtProxy: false };
    }
  }

  const asSocks = parseWhatsAppProxyUrl(telegramRaw);
  if (asSocks) {
    return { url: asSocks, source: "telegram", telegramIsMtProxy: false };
  }

  return { url: null, source: null, telegramIsMtProxy: false };
}

export function getWhatsAppProxyUrl(): string | null {
  return getWhatsAppProxyInfo().url;
}

export function createWhatsAppProxyAgent(): HttpsAgent | undefined {
  const proxyUrl = getWhatsAppProxyUrl();
  if (!proxyUrl) return undefined;

  if (/^socks/i.test(proxyUrl)) {
    return new SocksProxyAgent(proxyUrl) as unknown as HttpsAgent;
  }
  return new HttpsProxyAgent(proxyUrl) as unknown as HttpsAgent;
}

export function maskProxyUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.password) url.password = "****";
    return url.toString();
  } catch {
    return raw.replace(/secret=[^&]+/, "secret=****").replace(/:([^:@]+)@/, ":****@");
  }
}

export function isWhatsAppProxyConfigured(): boolean {
  return Boolean(getWhatsAppProxyUrl());
}

export function getWhatsAppProxyHint(): string | null {
  const info = getWhatsAppProxyInfo();
  if (info.url && info.source === "telegram") {
    return "Используется SOCKS-прокси из настроек Telegram.";
  }
  if (info.telegramIsMtProxy) {
    return "У Telegram задан MTProxy (t.me/proxy) — он не подходит для WhatsApp. Нужен SOCKS5 или HTTP.";
  }
  if (!info.url) {
    return "Задайте SOCKS5/HTTP прокси — свой или тот же, что для Telegram (если это SOCKS, не MTProxy).";
  }
  return null;
}
