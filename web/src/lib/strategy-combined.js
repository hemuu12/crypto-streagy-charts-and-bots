import { ema, rsi, sma, chandeMO } from "./indicators.js";
import {
  PULLBACK_EMA_FAST,
  PULLBACK_EMA_SLOW,
  RSI_LENGTH,
  RSI_SMA_LENGTH,
  RSI_OVERBOUGHT,
  PULLBACK_CMO_LENGTH,
  COMBINED_CMO_ZONE_LOW,
  COMBINED_CMO_ZONE_HIGH,
} from "./config.js";

// Maps 4H RSI onto 1H candles, carrying only the most recent CLOSED 4H value —
// never a forming one.
function mapHigherTimeframe(candles1h, candles4h) {
  const closes4h = candles4h.map((c) => c.close);
  const rsi4h = rsi(closes4h, RSI_LENGTH);
  const rsiSma4h = sma(rsi4h, RSI_SMA_LENGTH);

  let idx = -1;
  return candles1h.map((c) => {
    while (idx + 1 < candles4h.length && candles4h[idx + 1].time <= c.time) idx++;
    return {
      ...c,
      rsi: idx >= 0 ? rsi4h[idx] : null,
      rsiSma: idx >= 0 ? rsiSma4h[idx] : null,
      rsiPrev: idx > 0 ? rsi4h[idx - 1] : null,
    };
  });
}

function entryChecks(c, cmoSeries, i) {
  const cmo = cmoSeries[i];
  const prevCmo = cmoSeries[i - 1];
  return {
    emaBullish: c.emaFast != null && c.emaSlow != null && c.emaFast > c.emaSlow,
    rsiAboveSma: c.rsi != null && c.rsiSma != null && c.rsi > c.rsiSma,
    rsiRising: c.rsi != null && c.rsiPrev != null && c.rsi > c.rsiPrev,
    rsiNotOverbought: c.rsi != null && c.rsi < RSI_OVERBOUGHT,
    cmoInZone: cmo != null && cmo >= COMBINED_CMO_ZONE_LOW && cmo <= COMBINED_CMO_ZONE_HIGH,
    cmoRising: cmo != null && prevCmo != null && cmo > prevCmo,
  };
}

function exitReason(c, entry) {
  if (c.close <= entry.stopLoss) return "stop_loss";
  if (c.close >= entry.takeProfit) return "take_profit";
  if (c.emaFast != null && c.emaSlow != null && c.emaFast < c.emaSlow) return "ema_bear_cross";
  if (c.rsi != null && c.rsi > RSI_OVERBOUGHT) return "rsi_overbought";
  if (c.rsi != null && c.rsiSma != null && c.rsi < c.rsiSma) return "rsi_below_sma";
  return null;
}

export function dropFormingCandle(candles, timeframeMs) {
  if (!candles.length) return candles;
  const last = candles[candles.length - 1];
  return last.time + timeframeMs > Date.now() ? candles.slice(0, -1) : candles;
}

/**
 * Combined long-only strategy: every condition from both the RSI+ChandeMO and
 * CMO-EMA-Pullback strategies must hold at once — EMA 50>200 (1H), RSI(4H)
 * above its SMA and rising and not overbought, and CMO(1H, length 14)
 * currently in the -100..-80 zone and rising versus the previous candle.
 * Same locking behaviour as the source strategies: once open, entry checks
 * are not re-evaluated, so the BUY marker cannot repaint. It clears only on
 * stop-loss, take-profit, EMA flipping bearish, RSI going overbought, or RSI
 * dropping below its SMA.
 */
export function generateCombinedSignals(candles1h, candles4h, { stopLossPct, takeProfitPct, cmoLength = PULLBACK_CMO_LENGTH }) {
  const mapped = mapHigherTimeframe(candles1h, candles4h);
  const closes = mapped.map((c) => c.close);
  const emaFast = ema(closes, PULLBACK_EMA_FAST);
  const emaSlow = ema(closes, PULLBACK_EMA_SLOW);
  const cmo = chandeMO(closes, cmoLength);

  const withIndicators = mapped.map((c, i) => ({
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
        reason: "combined_long",
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

export function getLatestCombinedSignal(evaluated) {
  const last = evaluated[evaluated.length - 1];
  if (!last) return null;
  return {
    signal: last.signal,
    close: last.close,
    emaFast: last.emaFast,
    emaSlow: last.emaSlow,
    rsi: last.rsi,
    rsiSma: last.rsiSma,
    cmo: last.cmo,
    checks: last.checks,
    inPosition: last.inPosition,
    reason: last.reason ?? null,
  };
}
