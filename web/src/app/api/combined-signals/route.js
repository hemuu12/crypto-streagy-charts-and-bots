import { NextResponse } from "next/server";
import { fetchOHLCV, fetchHistorical } from "@/lib/data.js";
import { generateCombinedSignals, dropFormingCandle } from "@/lib/strategy-combined.js";
import { RSI_TIMEFRAME, CHANDE_TIMEFRAME, STOP_LOSS_PCT, TAKE_PROFIT_PCT, PULLBACK_EMA_SLOW } from "@/lib/config.js";

const HOUR_MS = 60 * 60 * 1000;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pair = searchParams.get("pair") || "BTC/USDT";
  const limit = Number(searchParams.get("limit") || 250);
  const around = searchParams.get("around");

  try {
    let raw1h;
    let raw4h;

    if (around) {
      const center = new Date(around).getTime();
      const half = HOUR_MS * (limit / 2);
      const lead = HOUR_MS * (PULLBACK_EMA_SLOW + 20);
      const startDay = new Date(center - half - lead).toISOString().slice(0, 10);
      const endDay = new Date(center + half).toISOString().slice(0, 10);
      [raw1h, raw4h] = await Promise.all([
        fetchHistorical(pair, startDay, endDay, CHANDE_TIMEFRAME),
        fetchHistorical(pair, startDay, endDay, RSI_TIMEFRAME),
      ]);
    } else {
      [raw1h, raw4h] = await Promise.all([
        fetchOHLCV(pair, CHANDE_TIMEFRAME, limit + PULLBACK_EMA_SLOW + 20),
        fetchOHLCV(pair, RSI_TIMEFRAME, Math.ceil((limit + PULLBACK_EMA_SLOW + 20) / 4) + 60),
      ]);
    }

    const candles1h = dropFormingCandle(raw1h, HOUR_MS);
    const candles4h = dropFormingCandle(raw4h, 4 * HOUR_MS);

    const evaluated = generateCombinedSignals(candles1h, candles4h, {
      stopLossPct: STOP_LOSS_PCT,
      takeProfitPct: TAKE_PROFIT_PCT,
    });

    const trimmed = around ? evaluated : evaluated.slice(-limit);

    return NextResponse.json({ candles: trimmed });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
