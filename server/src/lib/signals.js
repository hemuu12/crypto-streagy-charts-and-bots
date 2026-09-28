import { fetchOHLCV, fetchHistorical } from "./exchange.js";
import { generatePullbackSignals, dropFormingCandle } from "./strategy-pullback.js";
import {
  PULLBACK_TIMEFRAME,
  PULLBACK_CMO_LENGTH,
  PULLBACK_EMA_LENGTH,
  PULLBACK_CMO_REVERSAL_POINTS,
  PULLBACK_COOLDOWN_BARS,
  PULLBACK_CMO_MIN,
} from "./config.js";

const HOUR_MS = 60 * 60 * 1000;

// Display-only candle timeframes the chart can render, mapped to their
// millisecond bar length. The strategy itself (EMA/CMO/signals) always runs
// on PULLBACK_TIMEFRAME (1h) regardless of which of these is picked — these
// only change what candles are drawn. All three are native intervals on
// every exchange/fallback we use, so no aggregation is needed.
const DISPLAY_TIMEFRAME_MS = {
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1h": HOUR_MS,
};

// Stamps each display-TF candle with the 1h-computed indicator/signal fields
// of the 1h bucket it falls into, so the chart can render finer candles while
// the strategy stays computed on 1h. A display candle whose 1h bucket hasn't
// closed yet (still forming) gets no fields — the frontend already handles
// missing ema/cmo/signal by simply not drawing them for that bar.
//
// `signal` (the BUY marker) is a one-time event on the 1h bar's close, so it
// is only placed on the LAST display candle inside that 1h bucket — stamping
// it on every sub-candle in the bucket would draw 2 (30m) or 4 (15m) BUY
// arrows for what is really a single 1h signal.
function mapOntoDisplayCandles(displayCandles, hourlyEvaluated) {
  const byBucket = new Map();
  for (const c of hourlyEvaluated) byBucket.set(c.time, c);

  const lastIndexInBucket = new Map();
  displayCandles.forEach((c, i) => {
    lastIndexInBucket.set(Math.floor(c.time / HOUR_MS) * HOUR_MS, i);
  });

  return displayCandles.map((c, i) => {
    const bucketTime = Math.floor(c.time / HOUR_MS) * HOUR_MS;
    const hourly = byBucket.get(bucketTime);
    if (!hourly) return { ...c, signal: 0, checks: null, inPosition: false, entryPrice: null };
    const isLastInBucket = lastIndexInBucket.get(bucketTime) === i;
    return {
      ...c,
      ema: hourly.ema,
      cmo: hourly.cmo,
      signal: isLastInBucket ? hourly.signal : 0,
      reason: hourly.reason,
      checks: hourly.checks,
      inPosition: hourly.inPosition,
      entryPrice: hourly.entryPrice,
    };
  });
}

export async function getPullbackSignals({
  pair,
  limit = 250,
  around,
  cmoLength = PULLBACK_CMO_LENGTH,
  emaLength = PULLBACK_EMA_LENGTH,
  reversalPoints = PULLBACK_CMO_REVERSAL_POINTS,
  cooldownBars = PULLBACK_COOLDOWN_BARS,
  cmoMin = PULLBACK_CMO_MIN,
  displayTimeframe = PULLBACK_TIMEFRAME,
}) {
  const timeframeMs = DISPLAY_TIMEFRAME_MS[displayTimeframe] ?? HOUR_MS;
  const leadBars = emaLength + 20;
  let raw;
  let source;

  if (around) {
    const center = new Date(around).getTime();
    const half = HOUR_MS * (limit / 2);
    const lead = HOUR_MS * leadBars;
    const startDay = new Date(center - half - lead).toISOString().slice(0, 10);
    const endDay = new Date(center + half).toISOString().slice(0, 10);
    ({ candles: raw, source } = await fetchHistorical(pair, startDay, endDay, PULLBACK_TIMEFRAME));
  } else {
    const totalBars = limit + leadBars;
    if (totalBars <= 300) {
      ({ candles: raw, source } = await fetchOHLCV(pair, PULLBACK_TIMEFRAME, totalBars));
    } else {
      const now = Date.now();
      const startDay = new Date(now - HOUR_MS * totalBars).toISOString().slice(0, 10);
      const endDay = new Date(now).toISOString().slice(0, 10);
      // End at the current instant, not `endDay`'s midnight — otherwise this
      // live view silently drops every candle since 00:00 UTC. Short TTL for
      // the same reason: this range's end moves with the clock.
      ({ candles: raw, source } = await fetchHistorical(pair, startDay, endDay, PULLBACK_TIMEFRAME, {
        endTs: now,
        ttlMs: 10_000,
      }));
    }
  }

  const candles = dropFormingCandle(raw, HOUR_MS);
  const evaluated = generatePullbackSignals(candles, {
    cmoLength,
    emaLength,
    reversalPoints,
    cooldownBars,
    cmoMin,
  });

  let trimmed;
  if (around) {
    // The fetch above pads extra lead-in candles before the window so the
    // EMA/CMO are warmed up by the time we reach it — slice those back off
    // here so the returned window is actually centered on `around`, not
    // shifted earlier by however many lead bars were fetched.
    const center = new Date(around).getTime();
    let centerIndex = evaluated.findIndex((c) => c.time >= center);
    if (centerIndex === -1) centerIndex = evaluated.length - 1;
    const half = Math.floor(limit / 2);
    const start = Math.max(0, centerIndex - half);
    trimmed = evaluated.slice(start, start + limit);
  } else {
    trimmed = evaluated.slice(-limit);
  }

  if (timeframeMs === HOUR_MS || !trimmed.length) {
    return { candles: trimmed, source };
  }

  // Re-fetch the same window at the display timeframe (raw OHLCV, no
  // strategy calc needed here) and stamp each bar with its 1h bucket's
  // already-computed indicator/signal fields. Always paginated — a large
  // 1h `limit` (e.g. 1000 hourly bars) needs 2x/4x that many 15m/30m bars,
  // which routinely exceeds a single exchange page. fetchOHLCV's single
  // request silently truncates to the exchange's own page cap instead of
  // erroring, which was dropping older bars (including BUY signal candles)
  // from the returned window without any error surfacing.
  const windowStart = trimmed[0].time;
  const windowEnd = trimmed[trimmed.length - 1].time + HOUR_MS;
  const now = Date.now();
  const startDay = new Date(windowStart).toISOString().slice(0, 10);
  const endDay = new Date(Math.min(windowEnd, now)).toISOString().slice(0, 10);
  const { candles: displayRaw, source: displaySource } = await fetchHistorical(pair, startDay, endDay, displayTimeframe, {
    endTs: Math.min(windowEnd, now),
    ttlMs: around ? undefined : 10_000,
  });

  const windowed = displayRaw.filter((c) => c.time >= windowStart && c.time < windowEnd);
  const displayCandles = dropFormingCandle(windowed, timeframeMs);

  return { candles: mapOntoDisplayCandles(displayCandles, trimmed), source: displaySource ?? source };
}
