import { ema, chandeMO } from "./indicators.js";
import {
  PULLBACK_EMA_LENGTH,
  PULLBACK_CMO_LENGTH,
  PULLBACK_CMO_ZONE_LOW,
  PULLBACK_CMO_ZONE_HIGH,
  PULLBACK_CMO_RISE_MIN,
} from "./config.js";

function entryChecks(c, cmoSeries, i) {
  const cmo = cmoSeries[i];
  const prevCmo = cmoSeries[i - 1];
  const priceAboveEma = c.ema != null && c.close > c.ema;
  // Last condition checked: CMO sitting in the -100..-30 zone and jumping at
  // least PULLBACK_CMO_RISE_MIN points versus the previous candle.
  const cmoZoneRise =
    cmo != null && prevCmo != null && cmo >= PULLBACK_CMO_ZONE_LOW && cmo <= PULLBACK_CMO_ZONE_HIGH && cmo - prevCmo >= PULLBACK_CMO_RISE_MIN;
  return { priceAboveEma, cmoZoneRise };
}

function exitReason(c, entry) {
  if (c.close <= entry.stopLoss) return "stop_loss";
  if (c.close >= entry.takeProfit) return "take_profit";
  if (c.ema != null && c.close < c.ema) return "price_below_ema";
  return null;
}

export function dropFormingCandle(candles, timeframeMs) {
  if (!candles.length) return candles;
  const last = candles[candles.length - 1];
  return last.time + timeframeMs > Date.now() ? candles.slice(0, -1) : candles;
}

/**
 * Single-EMA bullish filter + CMO pullback-and-recovery, long only. Signals
 * lock the same way as the RSI+ChandeMO strategy: once a position opens,
 * entry conditions stop being checked, so the BUY marker is permanent and
 * cannot repaint. It clears only on stop-loss, take-profit, or price closing
 * back below the EMA.
 */
export function generatePullbackSignals(
  candles,
  { stopLossPct, takeProfitPct, cmoLength = PULLBACK_CMO_LENGTH, emaLength = PULLBACK_EMA_LENGTH }
) {
  const closes = candles.map((c) => c.close);
  const emaSeries = ema(closes, emaLength);
  const cmo = chandeMO(closes, cmoLength);

  const withIndicators = candles.map((c, i) => ({
    ...c,
    ema: emaSeries[i],
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
    ema: last.ema,
    cmo: last.cmo,
    checks: last.checks,
    inPosition: last.inPosition,
    reason: last.reason ?? null,
  };
}
