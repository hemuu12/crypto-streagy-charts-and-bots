import { NextResponse } from "next/server";
import { fetchOHLCV } from "@/lib/data.js";
import { generateSignals } from "@/lib/strategy.js";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pair = searchParams.get("pair") || "BTC/USDT";
  const timeframe = searchParams.get("timeframe") || "4h";
  const limit = Number(searchParams.get("limit") || 250);

  try {
    const raw = await fetchOHLCV(pair, timeframe, limit);
    const candles = generateSignals(raw);
    return NextResponse.json({ candles });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
