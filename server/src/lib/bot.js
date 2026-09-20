import { getPullbackSignals } from "./signals.js";
import { loadPositions, savePosition, log, claimSignal, lastAlertedTime } from "./store.js";
import { PAIRS, INITIAL_CAPITAL, RISK_PER_TRADE } from "./config.js";
import { sendTelegramMessage } from "./telegram.js";
import { sendDesktopNotification } from "./desktop-notify.js";

// Must match the chart's default candle count (web page.js `candleLimit`).
// The EMA and the CMO anchor are both path-dependent, so a shorter window
// gives the bot a different — and under-warmed — view of the same market than
// the one the user is looking at: at 250 bars SOL's 200-EMA reads 104.76,
// at 1000 it reads 104.75, and the anchor history can diverge outright.
const SIGNAL_LIMIT = 1000;

// Alerts are for live trading, so only candles that close from now on are
// messaged — never historical BUYs already visible on the chart. On a cold
// start every existing signal is recorded as "seen" without alerting, so the
// first live BUY after startup is the first notification.
//
// This is the only window that skips alerting. Once seeded, every later
// signal is delivered no matter how long the server was down, because the
// cutoff is the last recorded candle rather than a fixed look-back.
const SEED_ON_FIRST_RUN = true;

// Delay between starting each pair's fetch. Seven simultaneous 1000-candle
// requests exhaust the primary venue's rate limit, so ccxt silently falls
// back to another exchange whose candles differ slightly.
const PAIR_STAGGER_MS = 400;

/**
 * Every BUY in the window that has not been alerted yet, oldest first.
 *
 * The cutoff comes from the DB rather than a fixed bar count: whatever the
 * gap since the last alert — a 30s poll, a restart, a day offline — every
 * signal candle after it is still delivered. Claiming is an atomic insert,
 * so a signal is alerted exactly once even if two polls overlap.
 */
async function claimFreshSignals(symbol, candles) {
  const since = await lastAlertedTime(symbol);
  const seeding = SEED_ON_FIRST_RUN && since == null;

  const claimed = [];
  for (const candle of candles) {
    if (candle.signal !== 1) continue;
    if (since != null && candle.time <= since) continue;
    if (await claimSignal(symbol, candle.time)) claimed.push(candle);
  }

  // First ever run for this symbol: the BUYs in the window are history the
  // user can already see on the chart. Record them so they never fire later,
  // and alert nothing — notifications start with the next candle to close.
  if (seeding) {
    const newest = claimed.length ? new Date(claimed[claimed.length - 1].time).toISOString() : "none";
    await log(`${symbol} | seeded ${claimed.length} existing signals (newest ${newest}) — alerting live signals only from here`);
    return [];
  }

  return claimed;
}

async function alertBuy(symbol, candle, isLatest, positions) {
  const price = candle.close;
  const entry = candle.entryPrice ?? candle.open;
  const qty = (INITIAL_CAPITAL * RISK_PER_TRADE) / entry;
  const at = new Date(candle.time);

  // Only the newest BUY defines the live position; older backfilled ones are
  // still reported so nothing is silently dropped.
  if (isLatest || !positions[symbol]) {
    const pos = { entry, qty, time: at.toISOString() };
    positions[symbol] = pos;
    await savePosition(symbol, pos);
  }

  await log(`BOUGHT ${symbol} | qty=${qty.toFixed(6)} | entry=${entry} | candle=${at.toISOString()} | ema=${candle.ema?.toFixed(2)} | cmo=${candle.cmo?.toFixed(2)}`);

  const late = isLatest ? "" : "\n⏱ <i>late alert — signal candle already closed</i>";
  const text =
    `🟢 <b>BUY SIGNAL</b>\n` +
    `Coin: <b>${symbol}</b>\n` +
    `Price: ${price}\n` +
    `Entry: ${entry}\n` +
    `CMO: ${candle.cmo?.toFixed(2)}\n` +
    `EMA: ${candle.ema?.toFixed(2)}\n` +
    `Qty: ${qty.toFixed(6)}\n` +
    `Candle: ${at.toLocaleString("en-US", { timeZone: "UTC" })} UTC` +
    late;

  await sendTelegramMessage(text);
  sendDesktopNotification(
    `BUY ${symbol}`,
    `Price: ${price} | Entry: ${entry} | CMO: ${candle.cmo?.toFixed(2)}`
  );
}

async function checkPair(symbol, positions) {
  const { candles } = await getPullbackSignals({ pair: symbol, limit: SIGNAL_LIMIT });
  const last = candles[candles.length - 1];

  // An exhausted/rate-limited venue can return an empty or stub series rather
  // than throwing. Treat that as an error instead of "no signal today" —
  // otherwise a failed fetch is indistinguishable from a quiet market and the
  // seeding path would record a symbol as seen with nothing in it.
  if (!last) throw new Error("no candles returned (fetch likely rate-limited)");
  if (candles.length < SIGNAL_LIMIT / 2) {
    throw new Error(`short candle series (${candles.length}/${SIGNAL_LIMIT}) — indicators unreliable`);
  }

  const fresh = await claimFreshSignals(symbol, candles);
  if (!fresh.length) {
    await log(`${symbol} | signal=${last.signal} | price=${last.close} | ema=${last.ema?.toFixed(2)} | cmo=${last.cmo?.toFixed(2)} | inPosition=${!!positions[symbol]}`);
    return;
  }

  for (const candle of fresh) {
    await alertBuy(symbol, candle, candle.time === last.time, positions);
  }
}

export async function runBotOnce({ paper = true, pairs = PAIRS } = {}) {
  const positions = await loadPositions();

  // Settled independently so one exchange error or slow symbol never delays
  // or suppresses another symbol's alert. Starts are staggered because 7
  // simultaneous 1000-candle pulls trip the venue's rate limit, which makes
  // ccxt fail over mid-run and return a different exchange's candles.
  const results = await Promise.allSettled(
    pairs.map(async (symbol, i) => {
      await new Promise((r) => setTimeout(r, i * PAIR_STAGGER_MS));
      return checkPair(symbol, positions);
    })
  );

  for (const [i, outcome] of results.entries()) {
    if (outcome.status === "rejected") {
      await log(`ERROR on ${pairs[i]}: ${outcome.reason?.message || outcome.reason}`);
    }
  }

  return positions;
}
