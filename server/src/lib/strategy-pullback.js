import { ema, chandeMO } from "./indicators.js";
import {
  PULLBACK_EMA_LENGTH,
  PULLBACK_CMO_LENGTH,
  PULLBACK_CMO_ZONE_LOW,
  PULLBACK_CMO_ZONE_HIGH,
  PULLBACK_COOLDOWN_BARS,
} from "./config.js";

function entryChecks(c, cmoSeries, i, zones) {
  const cmo = cmoSeries[i];
  // Last condition checked: CMO sitting in ANY of the selected zones (OR
  // across zones).
  const cmoInZone = cmo != null && zones.some(([low, high]) => cmo >= low && cmo <= high);
  return { priceAboveEma: c.ema != null && c.close > c.ema, cmoInZone };
}

export function dropFormingCandle(candles, timeframeMs) {
  if (!candles.length) return candles;
  const last = candles[candles.length - 1];
  return last.time + timeframeMs > Date.now() ? candles.slice(0, -1) : candles;
}

/**
 * Single-EMA bullish filter + CMO pullback, long only, no exits. Each BUY
 * re-arms after `cooldownBars` candles rather than locking forever — so the
 * strategy can re-enter on a fresh pullback instead of firing only once
 * across the whole series. No stop-loss, take-profit, or trend-exit; a
 * position is simply superseded by the next BUY once cooldown elapses.
 */
export function generatePullbackSignals(
  candles,
  {
    cmoLength = PULLBACK_CMO_LENGTH,
    emaLength = PULLBACK_EMA_LENGTH,
    zoneLow = PULLBACK_CMO_ZONE_LOW,
    zoneHigh = PULLBACK_CMO_ZONE_HIGH,
    zones,
    cooldownBars = PULLBACK_COOLDOWN_BARS,
  }
) {
  const resolvedZones = zones && zones.length ? zones : [[zoneLow, zoneHigh]];
  const closes = candles.map((c) => c.close);
  const emaSeries = ema(closes, emaLength);
  const cmo = chandeMO(closes, cmoLength);

  const withIndicators = candles.map((c, i) => ({
    ...c,
    ema: emaSeries[i],
    cmo: cmo[i],
  }));

  let entryPrice = null;
  let lastEntryIndex = null;

  return withIndicators.map((c, i) => {
    const checks = entryChecks(c, cmo, i, resolvedZones);
    const inCooldown = lastEntryIndex != null && i - lastEntryIndex < cooldownBars;

    if (inCooldown) {
      return { ...c, signal: 0, checks, inPosition: true, entryPrice };
    }

    if (Object.values(checks).every(Boolean)) {
      entryPrice = c.close;
      lastEntryIndex = i;
      return { ...c, signal: 1, reason: "cmo_ema_pullback", checks, inPosition: true, entryPrice };
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
