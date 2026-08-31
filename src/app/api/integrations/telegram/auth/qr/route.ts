import { NextResponse } from "next/server";
import {
  getPendingQrAuth,
  startTelegramQrAuth,
  submitTelegramQrPassword,
} from "@/lib/integrations/telegram-user/qr-auth";
import QRCode from "qrcode";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      password?: string;
      authId?: string;
    };

    if (body.authId && body.password) {
      const ok = submitTelegramQrPassword(body.authId, body.password);
      if (!ok) {
        return NextResponse.json(
          { error: "Сессия QR истекла или пароль не требуется" },
          { status: 400 },
        );
      }
      return NextResponse.json({ ok: true });
    }

    const { authId } = await startTelegramQrAuth();
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

  const pending = getPendingQrAuth(authId);
  if (!pending) {
    return NextResponse.json({ status: "expired" });
  }

  let qrDataUrl: string | null = null;
  if (pending.qrUrl) {
    qrDataUrl = await QRCode.toDataURL(pending.qrUrl, {
      margin: 1,
      width: 280,
    });
  }

  return NextResponse.json({
    status: pending.status,
    qrDataUrl,
    error: pending.error ?? null,
    passwordHint: pending.passwordHint ?? null,
  });
}
