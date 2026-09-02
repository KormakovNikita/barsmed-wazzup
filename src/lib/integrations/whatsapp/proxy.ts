import type { Agent as HttpsAgent } from "node:https";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import { getSetting } from "@/lib/settings-store";

export type WhatsAppProxySource = "whatsapp" | null;

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

function getWhatsAppProxyRaw(): string | null {
  const fromEnv = process.env.WHATSAPP_PROXY?.trim();
  const fromSettings = getSetting("whatsapp_proxy")?.trim();
  return fromEnv || fromSettings || null;
}

export function getWhatsAppProxyInfo(): {
  url: string | null;
  source: WhatsAppProxySource;
} {
  const whatsappRaw = getWhatsAppProxyRaw();
  if (!whatsappRaw) {
    return { url: null, source: null };
  }
  return {
    url: parseWhatsAppProxyUrl(whatsappRaw) ?? whatsappRaw,
    source: "whatsapp",
  };
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
  if (!info.url) {
    return "Задайте WHATSAPP_PROXY (SOCKS5) — отдельно от MTProxy Telegram.";
  }
  return null;
}
