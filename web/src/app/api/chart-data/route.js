import { NextResponse } from "next/server";
import { fetchOHLCV, fetchHistorical } from "@/lib/data.js";
import { generateSignals } from "@/lib/strategy.js";

const TIMEFRAME_MS = {
  "1m": 60 * 1000,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pair = searchParams.get("pair") || "BTC/USDT";
  const timeframe = searchParams.get("timeframe") || "4h";
  const limit = Number(searchParams.get("limit") || 250);
  const around = searchParams.get("around"); // ISO date string

  try {
    let raw;
    if (around) {
      const centerTs = new Date(around).getTime();
      const halfSpan = (TIMEFRAME_MS[timeframe] || TIMEFRAME_MS["4h"]) * (limit / 2);
      const start = new Date(centerTs - halfSpan).toISOString().slice(0, 10);
      const end = new Date(centerTs + halfSpan).toISOString().slice(0, 10);
      raw = await fetchHistorical(pair, start, end, timeframe);
    } else {
      raw = await fetchOHLCV(pair, timeframe, limit);
    }
    const candles = generateSignals(raw);
    return NextResponse.json({ candles });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
