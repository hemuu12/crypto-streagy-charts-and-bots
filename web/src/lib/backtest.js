import { fetchHistorical } from "./data.js";
import { generateSignals } from "./strategy.js";
import { BACKTEST_START, BACKTEST_END, INITIAL_CAPITAL, STOP_LOSS_PCT, TAKE_PROFIT_PCT, RISK_PER_TRADE, PAIRS } from "./config.js";

export async function runBacktest(symbol, start = BACKTEST_START, end = BACKTEST_END) {
  const raw = await fetchHistorical(symbol, start, end);
  const candles = generateSignals(raw);

  let capital = INITIAL_CAPITAL;
  let position = 0;
  let entryPrice = 0;
  const trades = [];

  for (const row of candles) {
    const price = row.close;
    const date = new Date(row.time).toISOString();

    if (row.signal === 1 && position === 0) {
      const qty = (capital * RISK_PER_TRADE) / price;
      position = qty;
      entryPrice = price;
      const stopLoss = price * (1 - STOP_LOSS_PCT);
      const takeProfit = price * (1 + TAKE_PROFIT_PCT);
      capital -= qty * price;
      trades.push({ type: "BUY", date, price, qty, stopLoss, takeProfit });
    } else if (position > 0) {
      const stopLoss = entryPrice * (1 - STOP_LOSS_PCT);
      const takeProfit = entryPrice * (1 + TAKE_PROFIT_PCT);
      let exitReason = null;
      let exitPrice = price;

      if (row.signal === -1) {
        exitReason = "death_cross";
      } else if (price <= stopLoss) {
        exitReason = "stop_loss";
        exitPrice = stopLoss;
      } else if (price >= takeProfit) {
        exitReason = "take_profit";
        exitPrice = takeProfit;
      }

      if (exitReason) {
        const pnl = (exitPrice - entryPrice) * position;
        capital += position * exitPrice;
        trades.push({ type: "SELL", date, price: exitPrice, qty: position, pnl, reason: exitReason });
        position = 0;
        entryPrice = 0;
      }
    }
  }

  if (position > 0) {
    const last = candles[candles.length - 1];
    const pnl = (last.close - entryPrice) * position;
    capital += position * last.close;
    trades.push({
      type: "SELL",
      date: new Date(last.time).toISOString(),
      price: last.close,
      qty: position,
      pnl,
      reason: "end_of_data",
    });
  }

  const sellTrades = trades.filter((t) => t.type === "SELL");
  const wins = sellTrades.filter((t) => (t.pnl || 0) > 0);
  const losses = sellTrades.filter((t) => (t.pnl || 0) <= 0);
  const totalPnl = sellTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);

  return {
    symbol,
    start,
    end,
    initialCapital: INITIAL_CAPITAL,
    finalCapital: Math.round(capital * 100) / 100,
    totalPnl: Math.round(totalPnl * 100) / 100,
    returnPct: Math.round(((capital - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100 * 100) / 100,
    totalTrades: sellTrades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: sellTrades.length ? Math.round((wins.length / sellTrades.length) * 100 * 100) / 100 : 0,
    trades,
  };
}

export async function runAllPairs() {
  const results = [];
  for (const pair of PAIRS) {
    results.push(await runBacktest(pair));
  }
  return results;
}
