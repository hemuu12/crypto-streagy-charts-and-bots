import { rsi, sma, chandeMO } from "./indicators.js";
import { RSI_LENGTH, RSI_SMA_LENGTH, RSI_OVERBOUGHT, CHANDE_LENGTH, CHANDE_ZONE_LOW, CHANDE_ZONE_HIGH } from "./config.js";

// Attaches 4H RSI values onto 1H candles. Each 1H candle carries the RSI of the
// most recent CLOSED 4H candle at that point in time — never a forming one.
export function mapHigherTimeframe(candles1h, candles4h) {
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

function entryChecks(c, prevChande, prevPrevChande) {
  return {
    rsiAboveSma: c.rsi != null && c.rsiSma != null && c.rsi > c.rsiSma,
    rsiRising: c.rsi != null && c.rsiPrev != null && c.rsi > c.rsiPrev,
    rsiNotOverbought: c.rsi != null && c.rsi < RSI_OVERBOUGHT,
    chandeInZone: c.chande != null && c.chande >= CHANDE_ZONE_LOW && c.chande <= CHANDE_ZONE_HIGH,
    chandeUturn:
      c.chande != null &&
      prevChande != null &&
      prevPrevChande != null &&
      c.chande > prevChande &&
      prevChande <= prevPrevChande,
  };
}

// ChandeMO governs entry timing only. It recovers past its zone within an hour
// or two of the U-turn, so using it as an exit closed every trade after ~1 bar
// and starved the TP/SL rules.
function exitReason(c, entry) {
  if (c.close <= entry.stopLoss) return "stop_loss";
  if (c.close >= entry.takeProfit) return "take_profit";
  if (c.rsi != null && c.rsi > RSI_OVERBOUGHT) return "rsi_overbought";
  if (c.rsi != null && c.rsiSma != null && c.rsi < c.rsiSma) return "rsi_below_sma";
  return null;
}

// Drops the still-forming candle so no indicator ever sees unconfirmed data.
export function dropFormingCandle(candles, timeframeMs) {
  if (!candles.length) return candles;
  const last = candles[candles.length - 1];
  return last.time + timeframeMs > Date.now() ? candles.slice(0, -1) : candles;
}

/**
 * Long-only RSI + ChandeMO signals. Signals are evaluated on closed candles and
 * then held: once a position is open, entry conditions are not re-checked, so a
 * BUY marker never disappears because a later candle disagrees. It clears only
 * when an exit condition fires.
 */
export function generateRsiSignals(candles1h, candles4h, { stopLossPct, takeProfitPct }) {
  const mapped = mapHigherTimeframe(candles1h, candles4h);
  const chande = chandeMO(mapped.map((c) => c.close), CHANDE_LENGTH);
  const withIndicators = mapped.map((c, i) => ({ ...c, chande: chande[i] }));

  let openEntry = null;

  return withIndicators.map((c, i) => {
    const checks = entryChecks(c, withIndicators[i - 1]?.chande, withIndicators[i - 2]?.chande);

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
        reason: "rsi_chande_long",
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

export function getLatestRsiSignal(evaluated) {
  const last = evaluated[evaluated.length - 1];
  if (!last) return null;
  return {
    signal: last.signal,
    close: last.close,
    rsi: last.rsi,
    rsiSma: last.rsiSma,
    chande: last.chande,
    checks: last.checks,
    inPosition: last.inPosition,
    reason: last.reason ?? null,
  };
}
