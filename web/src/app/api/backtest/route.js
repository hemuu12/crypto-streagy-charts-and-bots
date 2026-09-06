import { NextResponse } from "next/server";
import { runBacktest } from "@/lib/backtest.js";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pair = searchParams.get("pair") || "BTC/USDT";

  try {
    const result = await runBacktest(pair);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
