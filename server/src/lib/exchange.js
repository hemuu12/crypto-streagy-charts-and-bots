import ccxt from "ccxt";
import { cached } from "./cache.js";

const LIVE_TTL_MS = 10_000;
const HISTORICAL_TTL_MS = 60 * 60_000;
const TICKER_TTL_MS = 3_000;

function makeBinance() {
  return new ccxt.binance({ enableRateLimit: true, options: { defaultType: "spot" } });
}

function toCandles(raw) {
  return raw.map(([time, open, high, low, close, volume]) => ({ time, open, high, low, close, volume }));
}

export async function fetchOHLCV(symbol, timeframe, limit) {
  const key = `ohlcv:${symbol}:${timeframe}:${limit}`;
  return cached(key, LIVE_TTL_MS, async () => {
    const raw = await makeBinance().fetchOHLCV(symbol, timeframe, undefined, limit);
    return { candles: toCandles(raw), source: "binance" };
  });
}

export async function fetchHistorical(symbol, start, end, timeframe) {
  const key = `historical:${symbol}:${timeframe}:${start}:${end}`;
  return cached(key, HISTORICAL_TTL_MS, async () => {
    const since = new Date(start + "T00:00:00Z").getTime();
    const endTs = new Date(end + "T00:00:00Z").getTime();

    const exchange = makeBinance();
    let cursor = since;
    let all = [];
    while (cursor < endTs) {
      const page = await exchange.fetchOHLCV(symbol, timeframe, cursor, 1000);
      if (!page.length) break;
      all = all.concat(page);
      cursor = page[page.length - 1][0] + 1;
    }
    const seen = new Set();
    const deduped = all.filter((c) => {
      if (seen.has(c[0])) return false;
      seen.add(c[0]);
      return true;
    });

    return { candles: toCandles(deduped).filter((c) => c.time <= endTs), source: "binance" };
  });
}

export async function fetchTicker(symbol) {
  const key = `ticker:${symbol}`;
  return cached(key, TICKER_TTL_MS, async () => {
    const ticker = await makeBinance().fetchTicker(symbol);
    return { last: ticker.last, source: "binance" };
  });
}
