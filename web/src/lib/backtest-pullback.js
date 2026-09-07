import { fetchHistorical } from "./data.js";
import { generatePullbackSignals } from "./strategy-pullback.js";
import { saveBacktestRun } from "./history.js";
import {
  PULLBACK_TIMEFRAME,
  INITIAL_CAPITAL,
  STOP_LOSS_PCT,
  TAKE_PROFIT_PCT,
  RISK_PER_TRADE,
  PULLBACK_CMO_LENGTH,
  PULLBACK_EMA_LENGTH,
} from "./config.js";

function round(value, decimals) {
  if (value == null) return null;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

function snapshot(c) {
  return {
    ema: round(c.ema, 2),
    cmo: round(c.cmo, 2),
  };
}

export async function runPullbackBacktest(symbol, start, end, cmoLength = PULLBACK_CMO_LENGTH, emaLength = PULLBACK_EMA_LENGTH) {
  const raw = await fetchHistorical(symbol, start, end, PULLBACK_TIMEFRAME);
  const evaluated = generatePullbackSignals(raw, {
    stopLossPct: STOP_LOSS_PCT,
    takeProfitPct: TAKE_PROFIT_PCT,
    cmoLength,
    emaLength,
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
        reason: "cmo_ema_pullback",
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
    strategy: "pullback",
    symbol,
    start,
    end,
    cmoLength,
    emaLength,
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
