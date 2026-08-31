import { NextResponse } from "next/server";
import { getStats, listOperators } from "@/lib/store";

export async function GET() {
  return NextResponse.json({
    operators: listOperators(),
    stats: getStats(),
  });
}
