import { NextResponse } from "next/server";
import { fetchOHLCV, fetchHistorical } from "@/lib/data.js";
import { generateRsiSignals, dropFormingCandle } from "@/lib/strategy-rsi.js";
import { RSI_TIMEFRAME, CHANDE_TIMEFRAME, STOP_LOSS_PCT, TAKE_PROFIT_PCT } from "@/lib/config.js";

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
      // Window the fetch around a past trade, with enough lead-in for RSI 14 on 4H.
      const center = new Date(around).getTime();
      const half = HOUR_MS * (limit / 2);
      const lead = 4 * HOUR_MS * 60;
      const startDay = new Date(center - half - lead).toISOString().slice(0, 10);
      const endDay = new Date(center + half).toISOString().slice(0, 10);
      [raw1h, raw4h] = await Promise.all([
        fetchHistorical(pair, startDay, endDay, CHANDE_TIMEFRAME),
        fetchHistorical(pair, startDay, endDay, RSI_TIMEFRAME),
      ]);
    } else {
      [raw1h, raw4h] = await Promise.all([
        fetchOHLCV(pair, CHANDE_TIMEFRAME, limit),
        fetchOHLCV(pair, RSI_TIMEFRAME, Math.ceil(limit / 4) + 60),
      ]);
    }

    const candles1h = dropFormingCandle(raw1h, HOUR_MS);
    const candles4h = dropFormingCandle(raw4h, 4 * HOUR_MS);

    const candles = generateRsiSignals(candles1h, candles4h, {
      stopLossPct: STOP_LOSS_PCT,
      takeProfitPct: TAKE_PROFIT_PCT,
    });

    return NextResponse.json({ candles });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
