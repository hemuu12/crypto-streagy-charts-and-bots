import { Router } from "express";
import { getPullbackSignals } from "../lib/signals.js";
import { runPullbackBacktest } from "../lib/backtest.js";
import { loadBacktestRuns, loadPositions, loadLogLines, getBacktestKpis } from "../lib/store.js";
import { runBotOnce } from "../lib/bot.js";
import { BACKTEST_START } from "../lib/config.js";

const router = Router();

// Computed per-request rather than a fixed export, so the default end date
// never goes stale the way a hardcoded one would.
function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function parseZones(raw) {
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function num(v) {
  return v === undefined || v === null || v === "" ? undefined : Number(v);
}

// Shared strategy/backtest params, whether they arrive as query strings
// (GET) or a JSON body (POST) — the frontend supplies all of these per
// request rather than the server assuming fixed defaults.
function readStrategyParams(source) {
  return {
    cmoLength: num(source.cmoLength),
    emaLength: num(source.emaLength),
    zoneLow: num(source.zoneLow),
    zoneHigh: num(source.zoneHigh),
    zones: parseZones(source.zones),
    cooldownBars: num(source.cooldownBars),
    riskPerTrade: num(source.riskPerTrade),
    initialCapital: num(source.initialCapital),
    stopLossPct: num(source.stopLossPct),
    riskRewardRatio: num(source.riskRewardRatio),
  };
}

router.get("/pullback-signals", async (req, res) => {
  try {
    const { pair = "BTC/USDT", limit, around } = req.query;
    const result = await getPullbackSignals({
      pair,
      limit: num(limit),
      around,
      ...readStrategyParams(req.query),
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/pullback-signals/batch", async (req, res) => {
  try {
    const { pairs, limit, around } = req.body;
    if (!Array.isArray(pairs) || !pairs.length) {
      return res.status(400).json({ error: "pairs must be a non-empty array" });
    }

    const shared = { limit, around, ...readStrategyParams(req.body) };
    const settled = await Promise.allSettled(pairs.map((pair) => getPullbackSignals({ pair, ...shared })));

    const results = {};
    settled.forEach((outcome, i) => {
      const pair = pairs[i];
      results[pair] = outcome.status === "fulfilled" ? outcome.value : { error: outcome.reason?.message || "failed" };
    });

    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/backtest", async (req, res) => {
  try {
    const { pair = "BTC/USDT", start = BACKTEST_START, end = todayUTC() } = req.query;
    const result = await runPullbackBacktest(pair, start, end, readStrategyParams(req.query));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/backtest/batch", async (req, res) => {
  try {
    const { pairs, start = BACKTEST_START, end = todayUTC() } = req.body;
    if (!Array.isArray(pairs) || !pairs.length) {
      return res.status(400).json({ error: "pairs must be a non-empty array" });
    }

    const options = readStrategyParams(req.body);
    const settled = await Promise.allSettled(pairs.map((pair) => runPullbackBacktest(pair, start, end, options)));

    const results = {};
    settled.forEach((outcome, i) => {
      const pair = pairs[i];
      results[pair] = outcome.status === "fulfilled" ? outcome.value : { error: outcome.reason?.message || "failed" };
    });

    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/backtest-history", async (req, res) => {
  try {
    const { strategy, symbol, limit } = req.query;
    const runs = await loadBacktestRuns({ strategy, symbol, limit: num(limit) });
    res.json({ runs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Aggregated KPIs across every saved backtest run for a strategy (optionally
// narrowed to one symbol) — avg return, avg win rate, best/worst run, etc.
router.get("/backtest-kpis", async (req, res) => {
  try {
    const { strategy = "pullback", symbol } = req.query;
    const kpis = await getBacktestKpis({ strategy, symbol });
    res.json(kpis);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/run-bot", async (req, res) => {
  try {
    const { paper = true, pairs } = req.body || {};
    const positions = await runBotOnce({ paper, pairs });
    res.json({ positions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/positions", async (req, res) => {
  try {
    const positions = await loadPositions();
    res.json({ positions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/log", async (req, res) => {
  try {
    const lines = await loadLogLines();
    res.json({ lines });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
