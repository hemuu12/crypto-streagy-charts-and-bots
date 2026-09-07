import { NextResponse } from "next/server";
import { runBacktest } from "@/lib/backtest.js";
import { runRsiBacktest } from "@/lib/backtest-rsi.js";
import { runPullbackBacktest } from "@/lib/backtest-pullback.js";
import { runCombinedBacktest } from "@/lib/backtest-combined.js";
import { BACKTEST_START, BACKTEST_END } from "@/lib/config.js";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pair = searchParams.get("pair") || "BTC/USDT";
  const start = searchParams.get("start") || BACKTEST_START;
  const end = searchParams.get("end") || BACKTEST_END;
  const strategy = searchParams.get("strategy") || "ema";
  const cmoLengthParam = searchParams.get("cmoLength");
  const cmoLength = cmoLengthParam ? Number(cmoLengthParam) : undefined;
  const emaLengthParam = searchParams.get("emaLength");
  const emaLength = emaLengthParam ? Number(emaLengthParam) : undefined;

  try {
    let result;
    if (strategy === "rsi") result = await runRsiBacktest(pair, start, end);
    else if (strategy === "pullback") result = await runPullbackBacktest(pair, start, end, cmoLength, emaLength);
    else if (strategy === "combined") result = await runCombinedBacktest(pair, start, end, cmoLength);
    else result = await runBacktest(pair, start, end);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
