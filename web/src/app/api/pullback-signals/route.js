import { NextResponse } from "next/server";
import { fetchOHLCV, fetchHistorical } from "@/lib/data.js";
import { generatePullbackSignals, dropFormingCandle } from "@/lib/strategy-pullback.js";
import { PULLBACK_TIMEFRAME, STOP_LOSS_PCT, TAKE_PROFIT_PCT, PULLBACK_CMO_LENGTH, PULLBACK_EMA_LENGTH } from "@/lib/config.js";

const HOUR_MS = 60 * 60 * 1000;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pair = searchParams.get("pair") || "BTC/USDT";
  const limit = Number(searchParams.get("limit") || 250);
  const around = searchParams.get("around");
  const cmoLength = Number(searchParams.get("cmoLength") || PULLBACK_CMO_LENGTH);
  const emaLength = Number(searchParams.get("emaLength") || PULLBACK_EMA_LENGTH);

  try {
    let raw;
    const leadBars = emaLength + 20;
    if (around) {
      const center = new Date(around).getTime();
      const half = HOUR_MS * (limit / 2);
      const lead = HOUR_MS * leadBars;
      const startDay = new Date(center - half - lead).toISOString().slice(0, 10);
      const endDay = new Date(center + half).toISOString().slice(0, 10);
      raw = await fetchHistorical(pair, startDay, endDay, PULLBACK_TIMEFRAME);
    } else {
      raw = await fetchOHLCV(pair, PULLBACK_TIMEFRAME, limit + leadBars);
    }

    const candles = dropFormingCandle(raw, HOUR_MS);
    const evaluated = generatePullbackSignals(candles, {
      stopLossPct: STOP_LOSS_PCT,
      takeProfitPct: TAKE_PROFIT_PCT,
      cmoLength,
      emaLength,
    });

    // Trim the EMA warm-up lead-in for the live view; keep full history for "around".
    const trimmed = around ? evaluated : evaluated.slice(-limit);

    return NextResponse.json({ candles: trimmed });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
