import { NextResponse } from "next/server";
import { getApiCredentials } from "@/lib/integrations/telegram-user/auth-state";
import {
  getTelegramProxy,
  maskProxyUrl,
  parseTelegramProxyUrl,
} from "@/lib/integrations/telegram-user/proxy";
import { deleteSetting, getSetting, setSetting } from "@/lib/settings-store";

export async function GET() {
  const creds = getApiCredentials();
  const storedId = getSetting("telegram_api_id");
  const storedHash = getSetting("telegram_api_hash");
  const proxyRaw =
    getSetting("telegram_proxy") ?? process.env.TELEGRAM_PROXY ?? "";

  return NextResponse.json({
    configured: Boolean(creds),
    apiId: storedId ?? process.env.TELEGRAM_API_ID ?? "",
    hasHash: Boolean(storedHash || process.env.TELEGRAM_API_HASH),
    source: storedId ? "settings" : process.env.TELEGRAM_API_ID ? "env" : null,
    hasProxy: Boolean(getTelegramProxy()),
    proxyPreview: proxyRaw ? maskProxyUrl(proxyRaw) : null,
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    apiId?: string;
    apiHash?: string;
    proxy?: string;
  };

  const apiId = body.apiId?.trim();
  const apiHash = body.apiHash?.trim();
  const proxy = body.proxy?.trim();

  const existingId = getSetting("telegram_api_id") ?? process.env.TELEGRAM_API_ID;
  const existingHash =
    getSetting("telegram_api_hash") ?? process.env.TELEGRAM_API_HASH;

  if (proxy && !apiId && !apiHash) {
    if (!parseTelegramProxyUrl(proxy)) {
      return NextResponse.json(
        {
          error:
            "Некорректный прокси. SOCKS5: socks5://user:pass@host:1080 или MTProxy: ссылка t.me/proxy?...",
        },
        { status: 400 },
      );
    }
    setSetting("telegram_proxy", proxy);
    return NextResponse.json({ ok: true });
  }

  if (!apiId || !apiHash) {
    return NextResponse.json(
      { error: "API ID и API Hash обязательны" },
      { status: 400 },
    );
  }

  if (!/^\d+$/.test(apiId)) {
    return NextResponse.json(
      { error: "API ID должен быть числом" },
      { status: 400 },
    );
  }

  if (proxy && !parseTelegramProxyUrl(proxy)) {
    return NextResponse.json(
      {
        error:
          "Некорректный прокси. SOCKS5: socks5://user:pass@host:1080 или MTProxy: ссылка t.me/proxy?...",
      },
      { status: 400 },
    );
  }

  setSetting("telegram_api_id", apiId);
  setSetting("telegram_api_hash", apiHash);
  if (proxy) {
    setSetting("telegram_proxy", proxy);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  deleteSetting("telegram_api_id");
  deleteSetting("telegram_api_hash");
  deleteSetting("telegram_proxy");
  return NextResponse.json({ ok: true });
}
