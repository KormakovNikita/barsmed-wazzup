import { NextResponse } from "next/server";
import { deleteSetting, getSetting, setSetting } from "@/lib/settings-store";
import {
  getWhatsAppProxyUrl,
  maskProxyUrl,
  parseWhatsAppProxyUrl,
} from "@/lib/integrations/whatsapp/proxy";

export const runtime = "nodejs";

export async function GET() {
  const proxyRaw =
    getSetting("whatsapp_proxy") ?? process.env.WHATSAPP_PROXY ?? "";
  const configured = Boolean(getWhatsAppProxyUrl());

  return NextResponse.json({
    configured,
    proxyPreview: proxyRaw ? maskProxyUrl(proxyRaw) : null,
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const proxy = typeof body.proxy === "string" ? body.proxy.trim() : "";

  if (proxy) {
    const parsed = parseWhatsAppProxyUrl(proxy);
    if (!parsed) {
      return NextResponse.json(
        {
          error:
            "Некорректный прокси. Формат: socks5://host:port или socks5://user:pass@host:port",
        },
        { status: 400 },
      );
    }
    setSetting("whatsapp_proxy", proxy);
  } else {
    deleteSetting("whatsapp_proxy");
  }

  return NextResponse.json({ ok: true });
}
