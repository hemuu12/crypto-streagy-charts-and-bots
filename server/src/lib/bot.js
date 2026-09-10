import { getPullbackSignals } from "./signals.js";
import { loadPositions, savePosition, log } from "./store.js";
import { PAIRS, INITIAL_CAPITAL, RISK_PER_TRADE } from "./config.js";

export async function runBotOnce({ paper = true, pairs = PAIRS } = {}) {
  const positions = await loadPositions();

  for (const symbol of pairs) {
    try {
      const { candles } = await getPullbackSignals({ pair: symbol, limit: 5 });
      const last = candles[candles.length - 1];
      if (!last) continue;

      const price = last.close;
      const existing = positions[symbol];

      if (last.signal === 1 && !existing) {
        const qty = (INITIAL_CAPITAL * RISK_PER_TRADE) / price;
        const pos = { entry: price, qty, time: new Date().toISOString() };
        positions[symbol] = pos;
        await savePosition(symbol, pos);
        await log(`BOUGHT ${symbol} | qty=${qty.toFixed(6)} | entry=${price} | ema=${last.ema?.toFixed(2)} | cmo=${last.cmo?.toFixed(2)}`);
      } else {
        await log(`${symbol} | signal=${last.signal} | price=${price} | ema=${last.ema?.toFixed(2)} | cmo=${last.cmo?.toFixed(2)} | inPosition=${!!existing}`);
      }
    } catch (e) {
      await log(`ERROR on ${symbol}: ${e.message}`);
    }
  }

  return positions;
}
