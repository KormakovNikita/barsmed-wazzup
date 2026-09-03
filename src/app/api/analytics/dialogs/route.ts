import { NextResponse } from "next/server";
import { getDialogAnalytics } from "@/lib/store";

export const runtime = "nodejs";

function startOfDayIso(date: string): string {
  return `${date}T00:00:00.000Z`;
}

function endExclusiveIso(date: string): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json(
      { error: "Укажите from и to в формате YYYY-MM-DD" },
      { status: 400 },
    );
  }

  if (from > to) {
    return NextResponse.json(
      { error: "Дата начала не может быть позже даты конца" },
      { status: 400 },
    );
  }

  const analytics = getDialogAnalytics(startOfDayIso(from), endExclusiveIso(to));
  return NextResponse.json({
    ...analytics,
    from,
    to,
  });
}
