import { fetchHistorical } from "./exchange.js";
import { generatePullbackSignals } from "./strategy-pullback.js";
import { saveBacktestRun } from "./store.js";
import {
  PULLBACK_TIMEFRAME,
  INITIAL_CAPITAL,
  RISK_PER_TRADE,
  PULLBACK_CMO_LENGTH,
  PULLBACK_EMA_LENGTH,
  PULLBACK_CMO_ZONE_LOW,
  PULLBACK_CMO_ZONE_HIGH,
  PULLBACK_COOLDOWN_BARS,
  STOP_LOSS_PCT,
  RISK_REWARD_RATIO,
} from "./config.js";

function round(value, decimals) {
  if (value == null) return null;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

function snapshot(c) {
  return { ema: round(c.ema, 2), cmo: round(c.cmo, 2) };
}

export async function runPullbackBacktest(symbol, start, end, options = {}) {
  const {
    cmoLength = PULLBACK_CMO_LENGTH,
    emaLength = PULLBACK_EMA_LENGTH,
    zoneLow = PULLBACK_CMO_ZONE_LOW,
    zoneHigh = PULLBACK_CMO_ZONE_HIGH,
    zones,
    cooldownBars = PULLBACK_COOLDOWN_BARS,
    riskPerTrade = RISK_PER_TRADE,
    initialCapital = INITIAL_CAPITAL,
    stopLossPct = STOP_LOSS_PCT,
    riskRewardRatio = RISK_REWARD_RATIO,
  } = options;

  const { candles: raw, source } = await fetchHistorical(symbol, start, end, PULLBACK_TIMEFRAME);
  const evaluated = generatePullbackSignals(raw, {
    cmoLength,
    emaLength,
    zoneLow,
    zoneHigh,
    zones,
    cooldownBars,
  });

  let capital = initialCapital;
  const trades = [];
  let open = null;

  // Each trade has a fixed stop and a target at `riskRewardRatio` times the
  // stop distance. A candle that touches either level closes the trade; no
  // new trade opens while one is running. When a candle's range spans both
  // levels the stop is assumed to hit first, since OHLC does not record the
  // order in which the extremes occurred.
  for (let i = 0; i < evaluated.length; i++) {
    const c = evaluated[i];

    if (open) {
      const hitStop = c.low <= open.stop;
      const hitTarget = c.high >= open.target;

      if (hitStop || hitTarget) {
        const exitPrice = hitStop ? open.stop : open.target;
        const pnl = (exitPrice - open.price) * open.qty;
        capital += open.qty * exitPrice;
        trades.push({
          type: "SELL",
          date: new Date(c.time).toISOString(),
          price: exitPrice,
          qty: open.qty,
          pnl,
          rMultiple: hitStop ? -1 : riskRewardRatio,
          reason: hitStop ? "stop_loss" : "take_profit",
          barsHeld: i - open.index,
          ...snapshot(c),
        });
        open = null;
      }
    }

    if (!open && c.signal === 1) {
      const stop = c.close * (1 - stopLossPct);
      const riskPerUnit = c.close - stop;
      // Size so that a stopped-out trade loses exactly `riskPerTrade` of
      // current capital.
      const qty = riskPerUnit > 0 ? (capital * riskPerTrade) / riskPerUnit : 0;
      const cost = qty * c.close;

      if (qty > 0 && cost <= capital) {
        capital -= cost;
        open = {
          price: c.close,
          qty,
          index: i,
          stop,
          target: c.close + riskPerUnit * riskRewardRatio,
        };
        trades.push({
          type: "BUY",
          date: new Date(c.time).toISOString(),
          price: c.close,
          qty,
          stop,
          target: open.target,
          reason: "cmo_ema_pullback",
          ...snapshot(c),
        });
      }
    }
  }

  // A trade still running at the end of the range is marked to market and
  // reported separately so it does not distort the win/loss ratio.
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
      rMultiple: pnl / (open.qty * (open.price - open.stop)),
      reason: "end_of_data",
      barsHeld: evaluated.length - 1 - open.index,
      ...snapshot(last),
    });
  }

  const sells = trades.filter((t) => t.type === "SELL");
  const wins = sells.filter((t) => (t.pnl || 0) > 0);
  const totalPnl = sells.reduce((sum, t) => sum + (t.pnl || 0), 0);

  // Only trades that resolved at their stop or target are counted in the R
  // stats; a trade cut short by the end of the range never got to play out.
  const resolved = sells.filter((t) => t.reason !== "end_of_data");
  const stopped = resolved.filter((t) => t.reason === "stop_loss");
  const hitTarget = resolved.filter((t) => t.reason === "take_profit");
  const openAtEnd = sells.filter((t) => t.reason === "end_of_data");

  const totalR = resolved.reduce((sum, t) => sum + (t.rMultiple || 0), 0);
  const resolvedWinRate = resolved.length ? (hitTarget.length / resolved.length) * 100 : 0;
  // Break-even win rate for this R:R — the hit rate needed to not lose money.
  const breakEvenWinRate = (1 / (1 + riskRewardRatio)) * 100;

  const result = {
    strategy: "pullback",
    symbol,
    start,
    end,
    cmoLength,
    emaLength,
    zoneLow,
    zoneHigh,
    zones,
    cooldownBars,
    riskPerTrade,
    stopLossPct,
    riskRewardRatio,
    source,
    initialCapital,
    finalCapital: round(capital, 2),
    totalPnl: round(totalPnl, 2),
    returnPct: round(((capital - initialCapital) / initialCapital) * 100, 2),
    totalTrades: sells.length,
    wins: wins.length,
    losses: sells.length - wins.length,
    winRate: sells.length ? round((wins.length / sells.length) * 100, 2) : 0,

    // Fixed-R performance: with a target at `riskRewardRatio`, every resolved
    // trade returns either +riskRewardRatio R or -1 R.
    rStats: {
      riskRewardRatio,
      resolvedTrades: resolved.length,
      targetHits: hitTarget.length,
      stopHits: stopped.length,
      openAtEnd: openAtEnd.length,
      winRate: round(resolvedWinRate, 2),
      breakEvenWinRate: round(breakEvenWinRate, 2),
      edge: round(resolvedWinRate - breakEvenWinRate, 2),
      totalR: round(totalR, 2),
      // Average R per trade. Positive means the edge is real over this sample.
      expectancyR: resolved.length ? round(totalR / resolved.length, 3) : 0,
    },

    trades,
  };

  await saveBacktestRun(result);
  return result;
}
