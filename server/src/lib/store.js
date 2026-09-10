import { getDb } from "./db.js";

export async function loadPositions() {
  const db = getDb();
  const rows = await db.collection("positions").find({}).toArray();
  const positions = {};
  for (const row of rows) {
    positions[row.symbol] = {
      entry: row.entry,
      qty: row.qty,
      stopLoss: row.stopLoss,
      takeProfit: row.takeProfit,
      time: row.openedAt,
    };
  }
  return positions;
}

export async function savePosition(symbol, pos) {
  const db = getDb();
  await db.collection("positions").updateOne(
    { symbol },
    { $set: { symbol, entry: pos.entry, qty: pos.qty, stopLoss: pos.stopLoss, takeProfit: pos.takeProfit, openedAt: pos.time } },
    { upsert: true }
  );
}

export async function removePosition(symbol) {
  const db = getDb();
  await db.collection("positions").deleteOne({ symbol });
}

export async function log(message) {
  const db = getDb();
  const createdAt = new Date();
  await db.collection("bot_log").insertOne({ message, createdAt });
  const ts = createdAt.toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${ts}] ${message}`);
}

export async function loadLogLines(limit = 60) {
  const db = getDb();
  const rows = await db
    .collection("bot_log")
    .find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return rows
    .reverse()
    .map((r) => `[${new Date(r.createdAt).toISOString().replace("T", " ").slice(0, 19)}] ${r.message}`);
}

export async function saveBacktestRun(result) {
  const db = getDb();
  await db.collection("backtest_runs").insertOne({ ...result, runAt: new Date() });
}

export async function loadBacktestRuns({ strategy, symbol, limit = 50 } = {}) {
  const db = getDb();
  const filter = {};
  if (strategy) filter.strategy = strategy;
  if (symbol) filter.symbol = symbol;

  const rows = await db
    .collection("backtest_runs")
    .find(filter)
    .sort({ runAt: -1 })
    .limit(limit)
    .toArray();
  return rows.map(({ _id, ...rest }) => rest);
}

// Aggregated performance stats across every saved run for a strategy
// (optionally narrowed to one symbol) — lets the frontend show "how has this
// strategy performed historically" without re-running every backtest.
export async function getBacktestKpis({ strategy = "pullback", symbol } = {}) {
  const db = getDb();
  const filter = { strategy };
  if (symbol) filter.symbol = symbol;

  const runs = await db.collection("backtest_runs").find(filter).toArray();
  if (!runs.length) {
    return {
      strategy,
      symbol: symbol || null,
      totalRuns: 0,
      totalTrades: 0,
      avgReturnPct: 0,
      avgWinRate: 0,
      bestRun: null,
      worstRun: null,
      profitableRunPct: 0,
    };
  }

  const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

  const totalTrades = runs.reduce((sum, r) => sum + (r.totalTrades || 0), 0);
  const avgReturnPct = round(runs.reduce((sum, r) => sum + (r.returnPct || 0), 0) / runs.length);
  const avgWinRate = round(runs.reduce((sum, r) => sum + (r.winRate || 0), 0) / runs.length);
  const profitableRuns = runs.filter((r) => (r.returnPct || 0) > 0);
  const profitableRunPct = round((profitableRuns.length / runs.length) * 100);

  const best = runs.reduce((a, b) => ((a.returnPct || 0) >= (b.returnPct || 0) ? a : b));
  const worst = runs.reduce((a, b) => ((a.returnPct || 0) <= (b.returnPct || 0) ? a : b));

  const pick = (r) => ({
    symbol: r.symbol,
    start: r.start,
    end: r.end,
    returnPct: r.returnPct,
    winRate: r.winRate,
    totalTrades: r.totalTrades,
    runAt: r.runAt,
  });

  return {
    strategy,
    symbol: symbol || null,
    totalRuns: runs.length,
    totalTrades,
    avgReturnPct,
    avgWinRate,
    profitableRunPct,
    bestRun: pick(best),
    worstRun: pick(worst),
  };
}
