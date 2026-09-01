import { NextResponse } from "next/server";
import { getPendingMaxQrAuth, startMaxQrAuth } from "@/lib/integrations/max-user/qr-auth";
import QRCode from "qrcode";

export const runtime = "nodejs";

export async function POST() {
  try {
    const { authId } = await startMaxQrAuth();
    return NextResponse.json({ authId });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Не удалось начать QR-вход",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const authId = new URL(request.url).searchParams.get("authId");
  if (!authId) {
    return NextResponse.json({ error: "authId обязателен" }, { status: 400 });
  }

  const pending = getPendingMaxQrAuth(authId);
  if (!pending) {
    return NextResponse.json({ status: "expired" });
  }

  let qrDataUrl: string | null = null;
  if (pending.qrLink) {
    qrDataUrl = await QRCode.toDataURL(pending.qrLink, {
      margin: 1,
      width: 280,
    });
  }

  return NextResponse.json({
    status: pending.status,
    qrDataUrl,
    error: pending.error ?? null,
  });
}
