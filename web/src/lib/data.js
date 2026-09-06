import ccxt from "ccxt";
import * as config from "./config.js";

export function getPublicExchange() {
  return new ccxt.binance({
    enableRateLimit: true,
    options: { defaultType: "spot" },
  });
}

export function getPrivateExchange() {
  return new ccxt.binance({
    apiKey: config.API_KEY,
    secret: config.API_SECRET,
    enableRateLimit: true,
    options: { defaultType: "spot" },
  });
}

function toCandles(raw) {
  return raw.map(([ts, open, high, low, close, volume]) => ({
    time: ts,
    open,
    high,
    low,
    close,
    volume,
  }));
}

export async function fetchOHLCV(symbol, timeframe = config.TIMEFRAME, limit = 500) {
  const exchange = getPublicExchange();
  const raw = await exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
  return toCandles(raw);
}

export async function fetchHistorical(symbol, start, end, timeframe = config.TIMEFRAME) {
  const exchange = getPublicExchange();
  let since = new Date(start + "T00:00:00Z").getTime();
  const endTs = new Date(end + "T00:00:00Z").getTime();

  let all = [];
  while (since < endTs) {
    const candles = await exchange.fetchOHLCV(symbol, timeframe, since, 1000);
    if (!candles.length) break;
    all = all.concat(candles);
    since = candles[candles.length - 1][0] + 1;
  }

  const seen = new Set();
  const deduped = all.filter((c) => {
    if (seen.has(c[0])) return false;
    seen.add(c[0]);
    return true;
  });

  return toCandles(deduped).filter((c) => c.time <= endTs);
}

export async function getBalance(asset = "USDT") {
  const exchange = getPrivateExchange();
  const balance = await exchange.fetchBalance();
  return balance.free?.[asset] || 0;
}

export async function getTickerPrice(symbol) {
  const exchange = getPublicExchange();
  const ticker = await exchange.fetchTicker(symbol);
  return ticker.last;
}

export function getExchange() {
  return getPrivateExchange();
}
