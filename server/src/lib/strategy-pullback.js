import { ema, chandeMO } from "./indicators.js";
import {
  PULLBACK_EMA_LENGTH,
  PULLBACK_CMO_LENGTH,
  PULLBACK_ZONE_A_LOW,
  PULLBACK_ZONE_A_HIGH,
  PULLBACK_ZONE_B_LOW,
  PULLBACK_ZONE_B_HIGH,
  PULLBACK_CMO_REVERSAL_POINTS,
  PULLBACK_COOLDOWN_BARS,
} from "./config.js";

export function dropFormingCandle(candles, timeframeMs) {
  if (!candles.length) return candles;
  const last = candles[candles.length - 1];
  return last.time + timeframeMs > Date.now() ? candles.slice(0, -1) : candles;
}

/**
 * Single-EMA bullish filter + CMO zone reversal, long only, no exits. CMO
 * must sit in zone A or zone B (OR'd), then a BUY fires once CMO has risen
 * at least `reversalPoints` above the lowest CMO recorded since it entered
 * that zone — the anchor resets whenever CMO leaves both zones. Each BUY
 * re-arms after `cooldownBars` candles rather than locking forever. No
 * stop-loss, take-profit, or trend-exit; a position is simply superseded by
 * the next BUY once cooldown elapses.
 */
export function generatePullbackSignals(
  candles,
  {
    cmoLength = PULLBACK_CMO_LENGTH,
    emaLength = PULLBACK_EMA_LENGTH,
    zoneA = [PULLBACK_ZONE_A_LOW, PULLBACK_ZONE_A_HIGH],
    zoneB = [PULLBACK_ZONE_B_LOW, PULLBACK_ZONE_B_HIGH],
    zones,
    reversalPoints = PULLBACK_CMO_REVERSAL_POINTS,
    cooldownBars = PULLBACK_COOLDOWN_BARS,
  }
) {
  const resolvedZones = zones && zones.length ? zones : [zoneA, zoneB];
  const closes = candles.map((c) => c.close);
  const emaSeries = ema(closes, emaLength);
  const cmoSeries = chandeMO(closes, cmoLength);

  const withIndicators = candles.map((c, i) => ({
    ...c,
    ema: emaSeries[i],
    cmo: cmoSeries[i],
  }));

  let entryPrice = null;
  let lastEntryIndex = null;
  let anchor = null; // lowest CMO recorded since it entered a zone

  return withIndicators.map((c, i) => {
    const cmo = c.cmo;
    const cmoInZone = cmo != null && resolvedZones.some(([low, high]) => cmo >= low && cmo <= high);

    if (cmoInZone) {
      anchor = anchor == null ? cmo : Math.min(anchor, cmo);
    } else {
      anchor = null;
    }

    const priceAboveEma = c.ema != null && c.close > c.ema;
    const reversalFromLow = anchor != null && cmo - anchor >= reversalPoints;
    const checks = { priceAboveEma, cmoInZone, reversalFromLow };

    const inCooldown = lastEntryIndex != null && i - lastEntryIndex < cooldownBars;

    if (inCooldown) {
      return { ...c, signal: 0, checks, inPosition: true, entryPrice };
    }

    if (Object.values(checks).every(Boolean)) {
      entryPrice = c.close;
      lastEntryIndex = i;
      return { ...c, signal: 1, reason: "cmo_zone_reversal", checks, inPosition: true, entryPrice };
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
