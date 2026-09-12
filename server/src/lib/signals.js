import { fetchOHLCV, fetchHistorical } from "./exchange.js";
import { generatePullbackSignals, dropFormingCandle } from "./strategy-pullback.js";
import {
  PULLBACK_TIMEFRAME,
  PULLBACK_CMO_LENGTH,
  PULLBACK_EMA_LENGTH,
  PULLBACK_CMO_ZONE_LOW,
  PULLBACK_CMO_ZONE_HIGH,
  PULLBACK_COOLDOWN_BARS,
} from "./config.js";

const HOUR_MS = 60 * 60 * 1000;

export async function getPullbackSignals({
  pair,
  limit = 250,
  around,
  cmoLength = PULLBACK_CMO_LENGTH,
  emaLength = PULLBACK_EMA_LENGTH,
  zoneLow = PULLBACK_CMO_ZONE_LOW,
  zoneHigh = PULLBACK_CMO_ZONE_HIGH,
  zones,
  cooldownBars = PULLBACK_COOLDOWN_BARS,
}) {
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
    zoneLow,
    zoneHigh,
    zones,
    cooldownBars,
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

  return { candles: trimmed, source };
}
