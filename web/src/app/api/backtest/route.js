import { NextResponse } from "next/server";
import { runBacktest } from "@/lib/backtest.js";
import { runRsiBacktest } from "@/lib/backtest-rsi.js";
import { BACKTEST_START, BACKTEST_END } from "@/lib/config.js";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pair = searchParams.get("pair") || "BTC/USDT";
  const start = searchParams.get("start") || BACKTEST_START;
  const end = searchParams.get("end") || BACKTEST_END;
  const strategy = searchParams.get("strategy") || "ema";

  try {
    const result =
      strategy === "rsi"
        ? await runRsiBacktest(pair, start, end)
        : await runBacktest(pair, start, end);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
