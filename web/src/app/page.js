"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Chart from "./components/Chart.jsx";

const PAIRS = ["BTC/USDT", "ETH/USDT", "BNB/USDT", "SOL/USDT"];
const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"];

export default function Home() {
  const [pair, setPair] = useState("BTC/USDT");
  const [timeframe, setTimeframe] = useState("4h");
  const [candleLimit, setCandleLimit] = useState(250);

  const [showEmaFast, setShowEmaFast] = useState(true);
  const [showEmaSlow, setShowEmaSlow] = useState(true);
  const [showSignals, setShowSignals] = useState(true);
  const [showVolume, setShowVolume] = useState(false);
  const [paperMode, setPaperMode] = useState(false);

  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [focusDate, setFocusDate] = useState(null);
  const [focusedTradeKey, setFocusedTradeKey] = useState(null);

  const [positions, setPositions] = useState([]);
  const [backtest, setBacktest] = useState(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [backtestStart, setBacktestStart] = useState("2022-01-01");
  const [backtestEnd, setBacktestEnd] = useState("2024-12-31");
  const [backtestHistory, setBacktestHistory] = useState([]);
  const [logLines, setLogLines] = useState([]);
  const [toast, setToast] = useState(null);

  const loadChart = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = focusDate
        ? `/api/chart-data?pair=${encodeURIComponent(pair)}&timeframe=${timeframe}&limit=${candleLimit}&around=${encodeURIComponent(focusDate)}`
        : `/api/chart-data?pair=${encodeURIComponent(pair)}&timeframe=${timeframe}&limit=${candleLimit}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCandles(data.candles);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [pair, timeframe, candleLimit, focusDate]);

  const loadPositions = useCallback(async () => {
    const res = await fetch("/api/positions");
    const data = await res.json();
    setPositions(data.positions || []);
  }, []);

  const loadLog = useCallback(async () => {
    const res = await fetch("/api/log");
    const data = await res.json();
    setLogLines(data.lines || []);
  }, []);

  const loadBacktestHistory = useCallback(async () => {
    const res = await fetch("/api/backtest-history");
    const data = await res.json();
    setBacktestHistory(data.runs || []);
  }, []);

  useEffect(() => {
    loadChart();
  }, [loadChart]);

  useEffect(() => {
    loadPositions();
    loadLog();
    loadBacktestHistory();
  }, [loadPositions, loadLog, loadBacktestHistory]);

  async function runBotOnce() {
    setToast("Running bot cycle...");
    try {
      await fetch("/api/run-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paper: paperMode }),
      });
      setToast("Bot cycle complete!");
      loadPositions();
      loadLog();
    } catch (e) {
      setToast(`Error: ${e.message}`);
    } finally {
      setTimeout(() => setToast(null), 3000);
    }
  }

  const chartSectionRef = useRef(null);

  function viewTradeOnChart(trade, key) {
    setFocusedTradeKey(key);
    setFocusDate(trade.date);
    chartSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function backToLive() {
    setFocusedTradeKey(null);
    setFocusDate(null);
  }

  async function runBacktest() {
    setBacktestLoading(true);
    try {
      const res = await fetch(
        `/api/backtest?pair=${encodeURIComponent(pair)}&start=${backtestStart}&end=${backtestEnd}`
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBacktest(data);
      loadBacktestHistory();
    } catch (e) {
      setError(e.message);
    } finally {
      setBacktestLoading(false);
    }
  }

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const priceChangePct = last && prev ? ((last.close - prev.close) / prev.close) * 100 : 0;

  return (
    <div className="flex min-h-screen bg-[#131722] text-[#d1d4dc]">
      <aside className="w-64 shrink-0 bg-[#1e222d] border-r border-[#2a2d3e] p-4 space-y-4">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-zinc-400">Controls</h2>

        <label className="block text-sm">
          Pair
          <select
            className="mt-1 w-full bg-[#131722] border border-[#2a2d3e] rounded px-2 py-1"
            value={pair}
            onChange={(e) => setPair(e.target.value)}
          >
            {PAIRS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          Timeframe
          <select
            className="mt-1 w-full bg-[#131722] border border-[#2a2d3e] rounded px-2 py-1"
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
          >
            {TIMEFRAMES.map((tf) => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          Candles: {candleLimit}
          <input
            type="range"
            min={50}
            max={500}
            step={50}
            value={candleLimit}
            onChange={(e) => setCandleLimit(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </label>

        <hr className="border-[#2a2d3e]" />

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showEmaFast} onChange={(e) => setShowEmaFast(e.target.checked)} />
          EMA Fast
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showEmaSlow} onChange={(e) => setShowEmaSlow(e.target.checked)} />
          EMA Slow
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showSignals} onChange={(e) => setShowSignals(e.target.checked)} />
          Buy/Sell Signals
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showVolume} onChange={(e) => setShowVolume(e.target.checked)} />
          Volume
        </label>

        <hr className="border-[#2a2d3e]" />

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={paperMode} onChange={(e) => setPaperMode(e.target.checked)} />
          Paper Trading
        </label>

        <button
          onClick={runBotOnce}
          className="w-full bg-blue-600 hover:bg-blue-700 rounded py-2 text-sm font-medium"
        >
          Run Bot Once
        </button>
        <hr className="border-[#2a2d3e]" />

        <label className="block text-sm">
          Backtest From
          <input
            type="date"
            value={backtestStart}
            onChange={(e) => setBacktestStart(e.target.value)}
            max={backtestEnd}
            className="mt-1 w-full bg-[#131722] border border-[#2a2d3e] rounded px-2 py-1"
          />
        </label>
        <label className="block text-sm">
          Backtest To
          <input
            type="date"
            value={backtestEnd}
            onChange={(e) => setBacktestEnd(e.target.value)}
            min={backtestStart}
            className="mt-1 w-full bg-[#131722] border border-[#2a2d3e] rounded px-2 py-1"
          />
        </label>

        <button
          onClick={runBacktest}
          disabled={backtestLoading}
          className="w-full bg-[#2a2d3e] hover:bg-[#333850] rounded py-2 text-sm font-medium disabled:opacity-50"
        >
          {backtestLoading ? "Running..." : "Run Backtest"}
        </button>
      </aside>

      <main className="flex-1 p-4 space-y-4 overflow-y-auto">
        <h1 className="text-xl font-semibold">EMA 50/200 Crypto Bot</h1>

        {toast && <div className="bg-green-900/50 border border-green-700 rounded px-3 py-2 text-sm">{toast}</div>}
        {error && <div className="bg-red-900/50 border border-red-700 rounded px-3 py-2 text-sm">{error}</div>}

        {last && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Metric
              label="Price"
              value={`$${last.close.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
              delta={`${priceChangePct >= 0 ? "+" : ""}${priceChangePct.toFixed(2)}%`}
              deltaPositive={priceChangePct >= 0}
              accent
            />
            <Metric label="EMA Fast" value={last.emaFast ? `$${last.emaFast.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "-"} sub="50-period" />
            <Metric label="EMA Slow" value={last.emaSlow ? `$${last.emaSlow.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "-"} sub="200-period" />
            <Metric
              label="Trend"
              value={
                <span className={`inline-flex items-center gap-1.5 ${last.emaFast > last.emaSlow ? "text-green-400" : "text-red-400"}`}>
                  <span className={`h-2 w-2 rounded-full ${last.emaFast > last.emaSlow ? "bg-green-400" : "bg-red-400"}`} />
                  {last.emaFast > last.emaSlow ? "Bullish" : "Bearish"}
                </span>
              }
            />
            <Metric label="24h High" value={`$${last.high.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} valueColor="text-green-400/90" />
            <Metric label="24h Low" value={`$${last.low.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} valueColor="text-red-400/90" />
          </div>
        )}

        <div ref={chartSectionRef} className="flex items-center justify-between">
          <h2 className="font-semibold">
            {focusDate ? (
              <>
                Viewing trade context ·{" "}
                <span className="text-zinc-400 font-normal">
                  {new Date(focusDate).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                </span>
              </>
            ) : (
              "Live Chart"
            )}
          </h2>
          {focusDate && (
            <button
              onClick={backToLive}
              className="text-xs bg-blue-600 hover:bg-blue-700 rounded px-3 py-1.5 font-medium"
            >
              ← Back to Live
            </button>
          )}
        </div>

        <div className="relative">
          {candles.length > 0 && (
            <Chart
              candles={candles}
              showEmaFast={showEmaFast}
              showEmaSlow={showEmaSlow}
              showSignals={showSignals}
              showVolume={showVolume}
              pair={pair}
              timeframe={timeframe}
            />
          )}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#131722]/60 backdrop-blur-[1px] rounded">
              <div className="flex items-center gap-2 text-sm text-zinc-300 bg-[#1e222d] border border-[#2a2d3e] rounded px-3 py-2">
                <span className="h-3.5 w-3.5 rounded-full border-2 border-zinc-500 border-t-blue-500 animate-spin" />
                Loading {pair} {timeframe}...
              </div>
            </div>
          )}
          {!loading && candles.length === 0 && (
            <div className="h-[520px] flex items-center justify-center text-sm text-zinc-400">
              No data available.
            </div>
          )}
        </div>

        <p className="text-xs text-zinc-500">🖱 Scroll to zoom · Click & drag to pan</p>

        <section>
          <h2 className="font-semibold mb-2">Open Positions</h2>
          {positions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-zinc-400 border-b border-[#2a2d3e]">
                    <th className="py-2 pr-4 font-medium">Pair</th>
                    <th className="py-2 pr-4 font-medium text-right">Entry</th>
                    <th className="py-2 pr-4 font-medium text-right">Current</th>
                    <th className="py-2 pr-4 font-medium text-right">Qty</th>
                    <th className="py-2 pr-4 font-medium text-right">Stop Loss</th>
                    <th className="py-2 pr-4 font-medium text-right">Take Profit</th>
                    <th className="py-2 pr-4 font-medium text-right">PnL</th>
                    <th className="py-2 pr-4 font-medium">Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => {
                    const isWin = p.pnlPct > 0;
                    return (
                      <tr key={p.symbol} className="border-b border-[#1e2130] hover:bg-[#1a1e29]">
                        <td className="py-2 pr-4 font-medium">{p.symbol}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">${p.entry.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">${p.current.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-zinc-400">{p.qty}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-red-400/80">${p.stopLoss.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-green-400/80">${p.takeProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        <td className={`py-2 pr-4 text-right tabular-nums font-medium ${isWin ? "text-green-400" : "text-red-400"}`}>
                          {isWin ? "+" : ""}{p.pnlPct}%
                        </td>
                        <td className="py-2 pr-4 text-zinc-400 whitespace-nowrap">
                          {new Date(p.time).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-zinc-400">No open positions.</div>
          )}
        </section>

        <section>
          <h2 className="font-semibold mb-2">Backtest Results</h2>
          {backtest && (
            <div className="space-y-2">
              <div className="text-xs text-zinc-400">
                {backtest.symbol} · {new Date(backtest.start).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                {" → "}
                {new Date(backtest.end).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
              </div>
              <div className="grid grid-cols-6 gap-2">
                <Metric label="Initial" value={`$${backtest.initialCapital.toLocaleString()}`} />
                <Metric label="Final" value={`$${backtest.finalCapital.toLocaleString()}`} />
                <Metric label="Return" value={`${backtest.returnPct}%`} />
                <Metric label="Win Rate" value={`${backtest.winRate}%`} />
                <Metric label="Total Trades" value={backtest.totalTrades} />
                <Metric label="W / L" value={`${backtest.wins} / ${backtest.losses}`} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left text-zinc-400 border-b border-[#2a2d3e]">
                      <th className="py-2 pr-4 font-medium">Date</th>
                      <th className="py-2 pr-4 font-medium">Type</th>
                      <th className="py-2 pr-4 font-medium text-right">Price</th>
                      <th className="py-2 pr-4 font-medium text-right">Qty</th>
                      <th className="py-2 pr-4 font-medium text-right">EMA Fast</th>
                      <th className="py-2 pr-4 font-medium text-right">EMA Slow</th>
                      <th className="py-2 pr-4 font-medium text-right">PnL</th>
                      <th className="py-2 pr-4 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backtest.trades.map((t, i) => {
                      const isBuy = t.type === "BUY";
                      const isWin = (t.pnl || 0) > 0;
                      const reasonStyles = {
                        golden_cross: "bg-blue-900/40 text-blue-400",
                        take_profit: "bg-green-900/40 text-green-400",
                        stop_loss: "bg-red-900/40 text-red-400",
                        death_cross: "bg-amber-900/40 text-amber-400",
                        end_of_data: "bg-zinc-700/40 text-zinc-400",
                      };
                      const reasonLabels = {
                        golden_cross: "Golden Cross",
                        take_profit: "Take Profit",
                        stop_loss: "Stop Loss",
                        death_cross: "Death Cross",
                        end_of_data: "End of Data",
                      };
                      const tradeKey = `${t.date}-${i}`;
                      const isSelected = focusedTradeKey === tradeKey;
                      return (
                        <tr
                          key={i}
                          onClick={() => viewTradeOnChart(t, tradeKey)}
                          title="Click to view this trade on the chart"
                          className={`border-b border-[#1e2130] cursor-pointer hover:bg-[#1a1e29] ${isSelected ? "bg-blue-900/20 ring-1 ring-inset ring-blue-500/40" : ""}`}
                        >
                          <td className="py-2 pr-4 text-zinc-300 whitespace-nowrap">
                            {new Date(t.date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                          </td>
                          <td className="py-2 pr-4">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${isBuy ? "bg-green-900/40 text-green-400" : "bg-red-900/40 text-red-400"}`}>
                              {isBuy ? "BUY" : "SELL"}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums">
                            ${t.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums text-zinc-400">{t.qty.toFixed(6)}</td>
                          <td className="py-2 pr-4 text-right tabular-nums text-amber-400/80">
                            {t.emaFast != null ? `$${t.emaFast.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums text-blue-400/80">
                            {t.emaSlow != null ? `$${t.emaSlow.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                          </td>
                          <td className={`py-2 pr-4 text-right tabular-nums font-medium ${isBuy ? "text-zinc-500" : isWin ? "text-green-400" : "text-red-400"}`}>
                            {isBuy ? "—" : `${isWin ? "+" : ""}$${t.pnl.toFixed(2)}`}
                          </td>
                          <td className="py-2 pr-4">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${reasonStyles[t.reason] || "bg-zinc-700/40 text-zinc-400"}`}>
                              {reasonLabels[t.reason] || t.reason}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <section>
          <h2 className="font-semibold mb-2">Backtest History</h2>
          {backtestHistory.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-zinc-400 border-b border-[#2a2d3e]">
                    <th className="py-2 pr-4 font-medium">Run At</th>
                    <th className="py-2 pr-4 font-medium">Pair</th>
                    <th className="py-2 pr-4 font-medium">Range</th>
                    <th className="py-2 pr-4 font-medium text-right">Return</th>
                    <th className="py-2 pr-4 font-medium text-right">Win Rate</th>
                    <th className="py-2 pr-4 font-medium text-right">Trades</th>
                  </tr>
                </thead>
                <tbody>
                  {backtestHistory.map((run, i) => (
                    <tr
                      key={i}
                      onClick={() => setBacktest(run)}
                      title="Click to load this run"
                      className="border-b border-[#1e2130] cursor-pointer hover:bg-[#1a1e29]"
                    >
                      <td className="py-2 pr-4 text-zinc-400 whitespace-nowrap">
                        {new Date(run.runAt).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="py-2 pr-4 font-medium">{run.symbol}</td>
                      <td className="py-2 pr-4 text-zinc-400 whitespace-nowrap">{run.start} → {run.end}</td>
                      <td className={`py-2 pr-4 text-right tabular-nums font-medium ${run.returnPct >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {run.returnPct >= 0 ? "+" : ""}{run.returnPct}%
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{run.winRate}%</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-zinc-400">{run.totalTrades}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-zinc-400">No backtest runs yet.</div>
          )}
        </section>

        <section>
          <h2 className="font-semibold mb-2">Bot Log</h2>
          {logLines.length > 0 ? (
            <div className="bg-[#1e222d] border border-[#2a2d3e] rounded overflow-hidden">
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-xs border-collapse">
                  <tbody>
                    {[...logLines].reverse().map((line, i) => (
                      <LogRow key={i} line={line} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-sm text-zinc-400">No log yet. Run the bot to see activity.</div>
          )}
        </section>

        <p className="text-xs text-zinc-500">EMA 50/200 Strategy · OKX · TradingView Lightweight Charts</p>
      </main>
    </div>
  );
}

function parseLogLine(line) {
  const match = line.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (!match) return { time: "", rest: line };
  const [, time, rest] = match;

  const cycle = rest.match(/^([A-Z]+\/[A-Z]+)\s*\|\s*trend=(\w+)\s*\|\s*signal=(-?\d)\s*\|\s*price=([\d.]+)$/);
  if (cycle) {
    const [, pair, trend, signal, price] = cycle;
    return { time, type: "cycle", pair, trend, signal: Number(signal), price: Number(price) };
  }

  const trade = rest.match(/^(BOUGHT|SOLD)\s+([A-Z]+\/[A-Z]+)\s*\|(.*)$/);
  if (trade) {
    const [, action, pair, detail] = trade;
    return { time, type: "trade", action, pair, detail: detail.trim() };
  }

  const error = rest.match(/^ERROR on ([A-Z]+\/[A-Z]+):\s*(.*)$/);
  if (error) {
    const [, pair, message] = error;
    return { time, type: "error", pair, message };
  }

  const skip = rest.match(/^(Max positions reached, skipping|Sleeping)\s*(.*)$/);
  if (skip) {
    return { time, type: "info", message: rest };
  }

  return { time, type: "raw", message: rest };
}

function LogRow({ line }) {
  const parsed = parseLogLine(line);

  const trendColor = parsed.trend === "bullish" ? "text-green-400" : "text-red-400";
  const signalLabel = { 1: "BUY", "-1": "SELL", 0: "—" }[parsed.signal] ?? "—";
  const signalColor = parsed.signal === 1 ? "text-green-400" : parsed.signal === -1 ? "text-red-400" : "text-zinc-500";

  return (
    <tr className="border-b border-[#1e2130] hover:bg-[#1a1e29]">
      <td className="py-1.5 px-3 text-zinc-500 whitespace-nowrap font-mono">{parsed.time}</td>
      {parsed.type === "cycle" && (
        <>
          <td className="py-1.5 px-3 font-medium whitespace-nowrap">{parsed.pair}</td>
          <td className={`py-1.5 px-3 whitespace-nowrap ${trendColor}`}>{parsed.trend === "bullish" ? "▲ Bullish" : "▼ Bearish"}</td>
          <td className={`py-1.5 px-3 font-medium whitespace-nowrap ${signalColor}`}>{signalLabel}</td>
          <td className="py-1.5 px-3 text-right tabular-nums whitespace-nowrap">${parsed.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
        </>
      )}
      {parsed.type === "trade" && (
        <td className="py-1.5 px-3" colSpan={4}>
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mr-2 ${parsed.action === "BOUGHT" ? "bg-green-900/40 text-green-400" : "bg-red-900/40 text-red-400"}`}>
            {parsed.action}
          </span>
          <span className="font-medium">{parsed.pair}</span>
          <span className="text-zinc-400 ml-2">{parsed.detail}</span>
        </td>
      )}
      {parsed.type === "error" && (
        <td className="py-1.5 px-3 text-red-400" colSpan={4}>
          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium mr-2 bg-red-900/40">ERROR</span>
          <span className="font-medium">{parsed.pair}</span>
          <span className="ml-2">{parsed.message}</span>
        </td>
      )}
      {(parsed.type === "info" || parsed.type === "raw") && (
        <td className="py-1.5 px-3 text-zinc-400" colSpan={4}>{parsed.message}</td>
      )}
    </tr>
  );
}

function Metric({ label, value, delta, deltaPositive, sub, valueColor, accent }) {
  return (
    <div
      className={`bg-[#1e222d] border rounded-lg px-3 py-2.5 ${
        accent ? "border-blue-900/50 ring-1 ring-blue-500/10" : "border-[#2a2d3e]"
      }`}
    >
      <div className="text-xs text-zinc-400 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-semibold mt-0.5 ${valueColor || "text-zinc-100"}`}>{value}</div>
      <div className="text-xs mt-0.5 h-4">
        {delta && (
          <span className={`inline-flex items-center gap-0.5 font-medium ${deltaPositive ? "text-green-400" : "text-red-400"}`}>
            {deltaPositive ? "▲" : "▼"} {delta}
          </span>
        )}
        {sub && !delta && <span className="text-zinc-500">{sub}</span>}
      </div>
    </div>
  );
}
