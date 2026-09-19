import { ema, chandeMO } from "./indicators.js";
import {
  PULLBACK_EMA_LENGTH,
  PULLBACK_CMO_LENGTH,
  PULLBACK_COOLDOWN_BARS,
  PULLBACK_CMO_REVERSAL_POINTS,
} from "./config.js";

export function dropFormingCandle(candles, timeframeMs) {
  if (!candles.length) return candles;
  const last = candles[candles.length - 1];
  return last.time + timeframeMs > Date.now() ? candles.slice(0, -1) : candles;
}

/**
 * Single-EMA bullish filter + CMO dynamic-anchor reversal, long only, no
 * exits. While CMO is negative, the anchor tracks the lowest CMO seen since
 * it last went negative — it only ever ratchets down, never resets on an
 * intermediate rise. A BUY fires once CMO has risen at least
 * `reversalPoints` above that anchor; the anchor then resets (armed again on
 * the next negative pullback) so the same low can't retrigger. Each BUY also
 * re-arms after `cooldownBars` candles rather than locking forever. No
 * stop-loss, take-profit, or trend-exit; a position is simply superseded by
 * the next BUY once cooldown elapses.
 */
export function generatePullbackSignals(
  candles,
  {
    cmoLength = PULLBACK_CMO_LENGTH,
    emaLength = PULLBACK_EMA_LENGTH,
    reversalPoints = PULLBACK_CMO_REVERSAL_POINTS,
    cooldownBars = PULLBACK_COOLDOWN_BARS,
  }
) {
  const opens = candles.map((c) => c.open);
  const emaSeries = ema(opens, emaLength);
  const cmoSeries = chandeMO(opens, cmoLength);

  const withIndicators = candles.map((c, i) => ({
    ...c,
    ema: emaSeries[i],
    cmo: cmoSeries[i],
  }));

  let entryPrice = null;
  let lastEntryIndex = null;
  let anchor = null; // lowest CMO recorded since it last went negative

  return withIndicators.map((c, i) => {
    const cmo = c.cmo;

    if (cmo != null && cmo < 0) {
      anchor = anchor == null ? cmo : Math.min(anchor, cmo);
    }

    const priceAboveEma = c.ema != null && c.open > c.ema;
    const reversalArmed = anchor != null && cmo != null;
    const reversalFromLow = reversalArmed && cmo - anchor >= reversalPoints;
    const checks = { priceAboveEma, reversalFromLow };

    const inCooldown = lastEntryIndex != null && i - lastEntryIndex < cooldownBars;

    if (inCooldown) {
      return { ...c, signal: 0, checks, inPosition: true, entryPrice };
    }

    if (Object.values(checks).every(Boolean)) {
      entryPrice = c.open;
      lastEntryIndex = i;
      anchor = null; // wait for the next negative CMO pullback to re-arm
      return { ...c, signal: 1, reason: "cmo_anchor_reversal", checks, inPosition: true, entryPrice };
    }

    return { ...c, signal: 0, checks, inPosition: entryPrice != null, entryPrice };
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
