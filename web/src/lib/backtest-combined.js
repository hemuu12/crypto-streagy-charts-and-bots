import { fetchHistorical } from "./data.js";
import { generateCombinedSignals } from "./strategy-combined.js";
import { saveBacktestRun } from "./history.js";
import {
  RSI_TIMEFRAME,
  CHANDE_TIMEFRAME,
  INITIAL_CAPITAL,
  STOP_LOSS_PCT,
  TAKE_PROFIT_PCT,
  RISK_PER_TRADE,
} from "./config.js";

function round(value, decimals) {
  if (value == null) return null;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

function snapshot(c) {
  return {
    emaFast: round(c.emaFast, 2),
    emaSlow: round(c.emaSlow, 2),
    rsi: round(c.rsi, 2),
    rsiSma: round(c.rsiSma, 2),
    cmo: round(c.cmo, 2),
  };
}

export async function runCombinedBacktest(symbol, start, end) {
  const [raw1h, raw4h] = await Promise.all([
    fetchHistorical(symbol, start, end, CHANDE_TIMEFRAME),
    fetchHistorical(symbol, start, end, RSI_TIMEFRAME),
  ]);

  const evaluated = generateCombinedSignals(raw1h, raw4h, {
    stopLossPct: STOP_LOSS_PCT,
    takeProfitPct: TAKE_PROFIT_PCT,
  });

  let capital = INITIAL_CAPITAL;
  const trades = [];
  let open = null;

  for (let i = 0; i < evaluated.length; i++) {
    const c = evaluated[i];

    if (c.signal === 1) {
      const qty = (capital * RISK_PER_TRADE) / c.close;
      capital -= qty * c.close;
      open = { price: c.close, qty, index: i };
      trades.push({
        type: "BUY",
        date: new Date(c.time).toISOString(),
        price: c.close,
        qty,
        stopLoss: c.stopLoss,
        takeProfit: c.takeProfit,
        reason: "combined_long",
        ...snapshot(c),
      });
    } else if (c.signal === -1 && open) {
      const pnl = (c.close - open.price) * open.qty;
      capital += open.qty * c.close;
      trades.push({
        type: "SELL",
        date: new Date(c.time).toISOString(),
        price: c.close,
        qty: open.qty,
        pnl,
        reason: c.reason,
        barsHeld: i - open.index,
        ...snapshot(c),
      });
      open = null;
    }
  }

  if (open) {
    const last = evaluated[evaluated.length - 1];
    const pnl = (last.close - open.price) * open.qty;
    capital += open.qty * last.close;
    trades.push({
      type: "SELL",
      date: new Date(last.time).toISOString(),
      price: last.close,
      qty: open.qty,
      pnl,
      reason: "end_of_data",
      barsHeld: evaluated.length - 1 - open.index,
      ...snapshot(last),
    });
  }

  const sells = trades.filter((t) => t.type === "SELL");
  const wins = sells.filter((t) => (t.pnl || 0) > 0);
  const totalPnl = sells.reduce((sum, t) => sum + (t.pnl || 0), 0);

  const result = {
    strategy: "combined",
    symbol,
    start,
    end,
    initialCapital: INITIAL_CAPITAL,
    finalCapital: round(capital, 2),
    totalPnl: round(totalPnl, 2),
    returnPct: round(((capital - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100, 2),
    totalTrades: sells.length,
    wins: wins.length,
    losses: sells.length - wins.length,
    winRate: sells.length ? round((wins.length / sells.length) * 100, 2) : 0,
    trades,
  };

  await saveBacktestRun(result);
  return result;
}
