import ccxt from "ccxt";
import * as config from "./config.js";

// Optional: set BINANCE_PROXY_URL to a Cloudflare Worker (or similar) that
// forwards requests to api.binance.com, to bypass geo-blocking on cloud hosts.
const PROXY_BASE = process.env.BINANCE_PROXY_URL; // e.g. https://your-worker.workers.dev

function applyProxy(exchange) {
  if (!PROXY_BASE) return exchange;
  exchange.urls["api"]["public"] = `${PROXY_BASE}/api/v3`;
  exchange.urls["api"]["private"] = `${PROXY_BASE}/api/v3`;
  return exchange;
}

export function getPublicExchange() {
  return applyProxy(
    new ccxt.binance({
      enableRateLimit: true,
      options: { defaultType: "spot" },
    })
  );
}

export function getPrivateExchange() {
  return applyProxy(
    new ccxt.binance({
      apiKey: config.API_KEY,
      secret: config.API_SECRET,
      enableRateLimit: true,
      options: { defaultType: "spot" },
    })
  );
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
