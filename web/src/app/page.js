"use client";

import { useState, useEffect, useCallback } from "react";
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
  const [showVolume, setShowVolume] = useState(true);
  const [paperMode, setPaperMode] = useState(true);

  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [positions, setPositions] = useState([]);
  const [backtest, setBacktest] = useState(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [logLines, setLogLines] = useState([]);
  const [toast, setToast] = useState(null);

  const loadChart = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/chart-data?pair=${encodeURIComponent(pair)}&timeframe=${timeframe}&limit=${candleLimit}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCandles(data.candles);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [pair, timeframe, candleLimit]);

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

  useEffect(() => {
    loadChart();
  }, [loadChart]);

  useEffect(() => {
    loadPositions();
    loadLog();
  }, [loadPositions, loadLog]);

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

  async function runBacktest() {
    setBacktestLoading(true);
    try {
      const res = await fetch(`/api/backtest?pair=${encodeURIComponent(pair)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBacktest(data);
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
          <div className="grid grid-cols-6 gap-2">
            <Metric label="Price" value={`$${last.close.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} delta={`${priceChangePct >= 0 ? "+" : ""}${priceChangePct.toFixed(2)}%`} />
            <Metric label="EMA Fast" value={last.emaFast ? `$${last.emaFast.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "-"} />
            <Metric label="EMA Slow" value={last.emaSlow ? `$${last.emaSlow.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "-"} />
            <Metric label="Trend" value={last.emaFast > last.emaSlow ? "🟢 BULLISH" : "🔴 BEARISH"} />
            <Metric label="High" value={`$${last.high.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
            <Metric label="Low" value={`$${last.low.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
          </div>
        )}

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
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-400 border-b border-[#2a2d3e]">
                  <th className="py-1 pr-4">Pair</th>
                  <th className="py-1 pr-4">Entry $</th>
                  <th className="py-1 pr-4">Current $</th>
                  <th className="py-1 pr-4">Qty</th>
                  <th className="py-1 pr-4">SL $</th>
                  <th className="py-1 pr-4">TP $</th>
                  <th className="py-1 pr-4">PnL %</th>
                  <th className="py-1 pr-4">Opened</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.symbol} className="border-b border-[#1e2130]">
                    <td className="py-1 pr-4">{p.symbol}</td>
                    <td className="py-1 pr-4">{p.entry}</td>
                    <td className="py-1 pr-4">{p.current}</td>
                    <td className="py-1 pr-4">{p.qty}</td>
                    <td className="py-1 pr-4">{p.stopLoss}</td>
                    <td className="py-1 pr-4">{p.takeProfit}</td>
                    <td className="py-1 pr-4">{p.pnlPct}%</td>
                    <td className="py-1 pr-4">{p.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-sm text-zinc-400">No open positions.</div>
          )}
        </section>

        <section>
          <h2 className="font-semibold mb-2">Backtest Results</h2>
          {backtest && (
            <div className="space-y-2">
              <div className="grid grid-cols-6 gap-2">
                <Metric label="Initial" value={`$${backtest.initialCapital.toLocaleString()}`} />
                <Metric label="Final" value={`$${backtest.finalCapital.toLocaleString()}`} />
                <Metric label="Return" value={`${backtest.returnPct}%`} />
                <Metric label="Win Rate" value={`${backtest.winRate}%`} />
                <Metric label="Total Trades" value={backtest.totalTrades} />
                <Metric label="W / L" value={`${backtest.wins} / ${backtest.losses}`} />
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-zinc-400 border-b border-[#2a2d3e]">
                    <th className="py-1 pr-4">Date</th>
                    <th className="py-1 pr-4">Price</th>
                    <th className="py-1 pr-4">Qty</th>
                    <th className="py-1 pr-4">PnL</th>
                    <th className="py-1 pr-4">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {backtest.trades.filter((t) => t.type === "SELL").map((t, i) => (
                    <tr key={i} className="border-b border-[#1e2130]">
                      <td className="py-1 pr-4">{t.date}</td>
                      <td className="py-1 pr-4">{t.price.toFixed(2)}</td>
                      <td className="py-1 pr-4">{t.qty.toFixed(6)}</td>
                      <td className="py-1 pr-4">{t.pnl.toFixed(2)}</td>
                      <td className="py-1 pr-4">{t.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h2 className="font-semibold mb-2">Bot Log</h2>
          {logLines.length > 0 ? (
            <pre className="bg-[#1e222d] border border-[#2a2d3e] rounded p-3 text-xs overflow-x-auto whitespace-pre-wrap">
              {logLines.join("\n")}
            </pre>
          ) : (
            <div className="text-sm text-zinc-400">No log yet. Run the bot to see activity.</div>
          )}
        </section>

        <p className="text-xs text-zinc-500">EMA 50/200 Strategy · Binance · TradingView Lightweight Charts</p>
      </main>
    </div>
  );
}

function Metric({ label, value, delta }) {
  return (
    <div className="bg-[#1e222d] border border-[#2a2d3e] rounded px-3 py-2">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {delta && <div className="text-xs text-zinc-400">{delta}</div>}
    </div>
  );
}
