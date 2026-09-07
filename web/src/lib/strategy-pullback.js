import { ema, chandeMO } from "./indicators.js";
import {
  PULLBACK_EMA_FAST,
  PULLBACK_EMA_SLOW,
  PULLBACK_CMO_LENGTH,
  PULLBACK_CMO_ZONE_LOW,
  PULLBACK_CMO_ZONE_HIGH,
} from "./config.js";

function entryChecks(c, cmoSeries, i) {
  const cmo = cmoSeries[i];
  const prevCmo = cmoSeries[i - 1];
  return {
    emaBullish: c.emaFast != null && c.emaSlow != null && c.emaFast > c.emaSlow,
    cmoInZone: cmo != null && cmo >= PULLBACK_CMO_ZONE_LOW && cmo <= PULLBACK_CMO_ZONE_HIGH,
    cmoRising: cmo != null && prevCmo != null && cmo > prevCmo,
  };
}

function exitReason(c, entry) {
  if (c.close <= entry.stopLoss) return "stop_loss";
  if (c.close >= entry.takeProfit) return "take_profit";
  if (c.emaFast != null && c.emaSlow != null && c.emaFast < c.emaSlow) return "ema_bear_cross";
  return null;
}

export function dropFormingCandle(candles, timeframeMs) {
  if (!candles.length) return candles;
  const last = candles[candles.length - 1];
  return last.time + timeframeMs > Date.now() ? candles.slice(0, -1) : candles;
}

/**
 * EMA 50/200 bullish filter + CMO pullback-and-recovery, long only. Signals
 * lock the same way as the RSI+ChandeMO strategy: once a position opens,
 * entry conditions stop being checked, so the BUY marker is permanent and
 * cannot repaint. It clears only on stop-loss, take-profit, or the EMA trend
 * flipping bearish.
 */
export function generatePullbackSignals(candles, { stopLossPct, takeProfitPct, cmoLength = PULLBACK_CMO_LENGTH }) {
  const closes = candles.map((c) => c.close);
  const emaFast = ema(closes, PULLBACK_EMA_FAST);
  const emaSlow = ema(closes, PULLBACK_EMA_SLOW);
  const cmo = chandeMO(closes, cmoLength);

  const withIndicators = candles.map((c, i) => ({
    ...c,
    emaFast: emaFast[i],
    emaSlow: emaSlow[i],
    cmo: cmo[i],
  }));

  let openEntry = null;

  return withIndicators.map((c, i) => {
    const checks = entryChecks(c, cmo, i);

    if (openEntry) {
      const reason = exitReason(c, openEntry);
      if (reason) {
        openEntry = null;
        return { ...c, signal: -1, reason, checks, inPosition: false };
      }
      return { ...c, signal: 0, checks, inPosition: true, entryPrice: openEntry.price };
    }

    if (Object.values(checks).every(Boolean)) {
      openEntry = {
        price: c.close,
        stopLoss: c.close * (1 - stopLossPct),
        takeProfit: c.close * (1 + takeProfitPct),
      };
      return {
        ...c,
        signal: 1,
        reason: "cmo_ema_pullback",
        checks,
        inPosition: true,
        entryPrice: openEntry.price,
        stopLoss: openEntry.stopLoss,
        takeProfit: openEntry.takeProfit,
      };
    }

    return { ...c, signal: 0, checks, inPosition: false };
  });
}

export function getLatestPullbackSignal(evaluated) {
  const last = evaluated[evaluated.length - 1];
  if (!last) return null;
  return {
    signal: last.signal,
    close: last.close,
    emaFast: last.emaFast,
    emaSlow: last.emaSlow,
    cmo: last.cmo,
    checks: last.checks,
    inPosition: last.inPosition,
    reason: last.reason ?? null,
  };
}
