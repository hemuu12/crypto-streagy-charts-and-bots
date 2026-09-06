import fs from "fs";
import path from "path";
import { fetchOHLCV, getExchange } from "./data.js";
import { getLatestSignal } from "./strategy.js";
import { positionSize, stopLossPrice, takeProfitPrice, isMaxPositionsReached, calcPnlPct } from "./risk.js";
import * as config from "./config.js";

const STATE_FILE = path.join(process.cwd(), "positions.json");
const LOG_FILE = path.join(process.cwd(), "bot.log");

export function loadPositions() {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  }
  return {};
}

export function savePositions(positions) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(positions, null, 2));
}

export function log(msg) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n");
}

async function placeBuy(exchange, symbol, qty) {
  return exchange.createMarketBuyOrder(symbol, qty);
}

async function placeSell(exchange, symbol, qty) {
  return exchange.createMarketSellOrder(symbol, qty);
}

export async function runOnce(paper = true) {
  const positions = loadPositions();
  const exchange = getExchange();

  for (const symbol of config.PAIRS) {
    try {
      const candles = await fetchOHLCV(symbol);
      const signal = getLatestSignal(candles);
      const price = signal.close;

      log(`${symbol} | trend=${signal.trend} | signal=${signal.signal} | price=${price}`);

      if (signal.signal === 1 && !positions[symbol]) {
        if (isMaxPositionsReached(positions)) {
          log(`Max positions reached, skipping ${symbol}`);
          continue;
        }

        const balance = paper ? config.INITIAL_CAPITAL : await exchange.fetchBalance().then((b) => b.free?.USDT || 0);
        const qty = positionSize(balance, price);
        const sl = stopLossPrice(price);
        const tp = takeProfitPrice(price);

        if (!paper) await placeBuy(exchange, symbol, qty);

        positions[symbol] = {
          entry: price,
          qty,
          stopLoss: sl,
          takeProfit: tp,
          time: new Date().toISOString(),
        };
        savePositions(positions);
        log(`BOUGHT ${symbol} | qty=${qty} | entry=${price} | SL=${sl} | TP=${tp}`);
      } else if (positions[symbol]) {
        const pos = positions[symbol];
        const { entry, qty, stopLoss: sl, takeProfit: tp } = pos;
        const pnlPct = calcPnlPct(entry, price);
        let reason = null;

        if (signal.signal === -1) reason = "death_cross";
        else if (price <= sl) reason = "stop_loss";
        else if (price >= tp) reason = "take_profit";

        if (reason) {
          if (!paper) await placeSell(exchange, symbol, qty);
          log(`SOLD ${symbol} | reason=${reason} | entry=${entry} | exit=${price} | pnl=${pnlPct}%`);
          delete positions[symbol];
          savePositions(positions);
        }
      }
    } catch (e) {
      log(`ERROR on ${symbol}: ${e.message}`);
    }
  }

  return positions;
}
