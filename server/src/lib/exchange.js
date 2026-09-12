import ccxt from "ccxt";
import { cached } from "./cache.js";

const LIVE_TTL_MS = 10_000;
const HISTORICAL_TTL_MS = 60 * 60_000;
// Must stay <= POLL_MS in ws/stream.js — otherwise the stream's faster polls
// just re-read this same cached value instead of fetching a fresh price.
const TICKER_TTL_MS = 1_000;

// Exchange choice is env-driven because some venues (okx, binance) are
// unreachable from certain networks/regions. EXCHANGE picks the preferred
// venue; EXCHANGE_FALLBACKS is a comma-separated list tried in order when the
// preferred one fails, so a regional block degrades instead of 500ing.
// Read lazily rather than at module load so .env is guaranteed to be applied
// regardless of import evaluation order.
function candidates() {
  const primary = process.env.EXCHANGE || "bybit";
  const fallbacks = (process.env.EXCHANGE_FALLBACKS ?? "mexc,kucoin,okx")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [primary, ...fallbacks].filter((id, i, all) => all.indexOf(id) === i);
}

const clients = new Map(); // exchangeId -> ccxt client

function makeExchange(id) {
  if (!clients.has(id)) {
    const Ctor = ccxt[id];
    if (typeof Ctor !== "function") throw new Error(`unknown exchange "${id}"`);
    clients.set(id, new Ctor({ enableRateLimit: true, timeout: 15_000, options: { defaultType: "spot" } }));
  }
  return clients.get(id);
}

// Runs `job` against each candidate exchange until one succeeds. Returns the
// job's result plus the id of the exchange that served it.
async function withExchange(job) {
  const errors = [];
  for (const id of candidates()) {
    try {
      const value = await job(makeExchange(id), id);
      return { value, source: id };
    } catch (e) {
      errors.push(`${id}: ${e.message}`);
    }
  }
  throw new Error(`all exchanges failed — ${errors.join(" | ")}`);
}

function toCandles(raw) {
  return raw.map(([time, open, high, low, close, volume]) => ({ time, open, high, low, close, volume }));
}

export async function fetchOHLCV(symbol, timeframe, limit) {
  const key = `ohlcv:${symbol}:${timeframe}:${limit}`;
  return cached(key, LIVE_TTL_MS, async () => {
    const { value, source } = await withExchange((ex) => ex.fetchOHLCV(symbol, timeframe, undefined, limit));
    return { candles: toCandles(value), source };
  });
}

// `end` is a YYYY-MM-DD day, which resolves to that day's MIDNIGHT — so a
// range ending "today" would stop at 00:00 and drop every candle since. Pass
// `opts.endTs` (epoch ms) to end at an exact instant instead; the live chart
// uses that with `Date.now()` so it reaches the current bar. `opts.ttlMs`
// likewise overrides the hour-long cache, which is far too long for a range
// whose end keeps moving.
export async function fetchHistorical(symbol, start, end, timeframe, opts = {}) {
  const endTsOverride = opts.endTs;
  const ttlMs = opts.ttlMs ?? HISTORICAL_TTL_MS;
  const key = `historical:${symbol}:${timeframe}:${start}:${endTsOverride ?? end}`;
  return cached(key, ttlMs, async () => {
    const since = new Date(start + "T00:00:00Z").getTime();
    const endTs = endTsOverride ?? new Date(end + "T00:00:00Z").getTime();

    const { value: all, source } = await withExchange(async (exchange) => {
      let cursor = since;
      let candles = [];
      while (cursor < endTs) {
        const page = await exchange.fetchOHLCV(symbol, timeframe, cursor, 1000);
        if (!page.length) break;
        candles = candles.concat(page);
        cursor = page[page.length - 1][0] + 1;
      }
      return candles;
    });

    const seen = new Set();
    const deduped = all.filter((c) => {
      if (seen.has(c[0])) return false;
      seen.add(c[0]);
      return true;
    });

    return { candles: toCandles(deduped).filter((c) => c.time <= endTs), source };
  });
}

export async function fetchTicker(symbol) {
  const key = `ticker:${symbol}`;
  return cached(key, TICKER_TTL_MS, async () => {
    const { value: ticker, source } = await withExchange((ex) => ex.fetchTicker(symbol));
    return { last: ticker.last, source };
  });
}
