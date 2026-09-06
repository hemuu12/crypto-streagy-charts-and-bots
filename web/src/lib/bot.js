import fs from "fs";
import path from "path";
import { sql, ensureSchema } from "./db.js";
import { fetchOHLCV, getExchange } from "./data.js";
import { getLatestSignal } from "./strategy.js";
import { positionSize, stopLossPrice, takeProfitPrice, isMaxPositionsReached, calcPnlPct } from "./risk.js";
import * as config from "./config.js";

const STATE_FILE = path.join(process.cwd(), "positions.json");
const LOG_FILE = path.join(process.cwd(), "bot.log");

function loadPositionsFromFile() {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  }
  return {};
}

function savePositionsToFile(positions) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(positions, null, 2));
}

export async function loadPositions() {
  if (!sql) return loadPositionsFromFile();

  await ensureSchema();
  const rows = await sql`SELECT * FROM positions`;
  const positions = {};
  for (const row of rows) {
    positions[row.symbol] = {
      entry: row.entry,
      qty: row.qty,
      stopLoss: row.stop_loss,
      takeProfit: row.take_profit,
      time: row.opened_at,
    };
  }
  return positions;
}

export async function savePosition(symbol, pos) {
  if (!sql) {
    const positions = loadPositionsFromFile();
    positions[symbol] = pos;
    savePositionsToFile(positions);
    return;
  }

  await ensureSchema();
  await sql`
    INSERT INTO positions (symbol, entry, qty, stop_loss, take_profit, opened_at)
    VALUES (${symbol}, ${pos.entry}, ${pos.qty}, ${pos.stopLoss}, ${pos.takeProfit}, ${pos.time})
    ON CONFLICT (symbol) DO UPDATE SET
      entry = EXCLUDED.entry, qty = EXCLUDED.qty,
      stop_loss = EXCLUDED.stop_loss, take_profit = EXCLUDED.take_profit,
      opened_at = EXCLUDED.opened_at
  `;
}

export async function removePosition(symbol) {
  if (!sql) {
    const positions = loadPositionsFromFile();
    delete positions[symbol];
    savePositionsToFile(positions);
    return;
  }

  await ensureSchema();
  await sql`DELETE FROM positions WHERE symbol = ${symbol}`;
}

export async function log(msg) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);

  if (!sql) {
    fs.appendFileSync(LOG_FILE, line + "\n");
    return;
  }

  await ensureSchema();
  await sql`INSERT INTO bot_log (logged_at, message) VALUES (now(), ${msg})`;
}

export async function loadLogLines(limit = 60) {
  if (!sql) {
    if (!fs.existsSync(LOG_FILE)) return [];
    const lines = fs.readFileSync(LOG_FILE, "utf-8").split("\n").filter(Boolean);
    return lines.slice(-limit);
  }

  await ensureSchema();
  const rows = await sql`
    SELECT logged_at, message FROM bot_log
    ORDER BY logged_at DESC
    LIMIT ${limit}
  `;
  return rows
    .reverse()
    .map((r) => `[${new Date(r.logged_at).toISOString().replace("T", " ").slice(0, 19)}] ${r.message}`);
}

async function placeBuy(exchange, symbol, qty) {
  return exchange.createMarketBuyOrder(symbol, qty);
}

async function placeSell(exchange, symbol, qty) {
  return exchange.createMarketSellOrder(symbol, qty);
}

export async function runOnce(paper = true) {
  const positions = await loadPositions();
  const exchange = getExchange();

  for (const symbol of config.PAIRS) {
    try {
      const candles = await fetchOHLCV(symbol);
      const signal = getLatestSignal(candles);
      const price = signal.close;
      const emaFast = signal.emaFast.toFixed(4);
      const emaSlow = signal.emaSlow.toFixed(4);

      await log(`${symbol} | trend=${signal.trend} | signal=${signal.signal} | price=${price} | emaFast=${emaFast} | emaSlow=${emaSlow}`);

      if (signal.signal === 1 && !positions[symbol]) {
        if (isMaxPositionsReached(positions)) {
          await log(`Max positions reached, skipping ${symbol}`);
          continue;
        }

        const balance = paper ? config.INITIAL_CAPITAL : await exchange.fetchBalance().then((b) => b.free?.USDT || 0);
        const qty = positionSize(balance, price);
        const sl = stopLossPrice(price);
        const tp = takeProfitPrice(price);

        if (!paper) await placeBuy(exchange, symbol, qty);

        const pos = {
          entry: price,
          qty,
          stopLoss: sl,
          takeProfit: tp,
          time: new Date().toISOString(),
        };
        positions[symbol] = pos;
        await savePosition(symbol, pos);
        await log(`BOUGHT ${symbol} | qty=${qty} | entry=${price} | SL=${sl} | TP=${tp} | emaFast=${emaFast} | emaSlow=${emaSlow}`);
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
          await log(`SOLD ${symbol} | reason=${reason} | entry=${entry} | exit=${price} | pnl=${pnlPct}% | emaFast=${emaFast} | emaSlow=${emaSlow}`);
          delete positions[symbol];
          await removePosition(symbol);
        }
      }
    } catch (e) {
      await log(`ERROR on ${symbol}: ${e.message}`);
    }
  }

  return positions;
}
