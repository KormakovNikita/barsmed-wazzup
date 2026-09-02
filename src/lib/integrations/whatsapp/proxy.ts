import type { Agent as HttpsAgent } from "node:https";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import { getSetting } from "@/lib/settings-store";

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

export function getWhatsAppProxyUrl(): string | null {
  const fromEnv = process.env.WHATSAPP_PROXY?.trim();
  const fromSettings = getSetting("whatsapp_proxy")?.trim();
  const raw = fromEnv || fromSettings;
  if (!raw) return null;
  return parseWhatsAppProxyUrl(raw) ?? raw;
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
    return raw.replace(/:([^:@]+)@/, ":****@");
  }
}

export function isWhatsAppProxyConfigured(): boolean {
  return Boolean(getWhatsAppProxyUrl());
}
