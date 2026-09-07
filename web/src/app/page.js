"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Chart from "./components/Chart.jsx";

const PAIRS = ["BTC/USDT", "ETH/USDT", "BNB/USDT", "SOL/USDT"];
const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"];

const REASON_STYLES = {
  golden_cross: "bg-blue-900/40 text-blue-400",
  rsi_chande_long: "bg-blue-900/40 text-blue-400",
  cmo_ema_pullback: "bg-blue-900/40 text-blue-400",
  combined_long: "bg-blue-900/40 text-blue-400",
  take_profit: "bg-green-900/40 text-green-400",
  stop_loss: "bg-red-900/40 text-red-400",
  death_cross: "bg-amber-900/40 text-amber-400",
  ema_bear_cross: "bg-amber-900/40 text-amber-400",
  rsi_overbought: "bg-red-900/40 text-red-400",
  rsi_below_sma: "bg-amber-900/40 text-amber-400",
  end_of_data: "bg-zinc-700/40 text-zinc-400",
};

const REASON_LABELS = {
  golden_cross: "Golden Cross",
  rsi_chande_long: "RSI + Chande",
  cmo_ema_pullback: "CMO + EMA",
  combined_long: "Combined",
  take_profit: "Take Profit",
  stop_loss: "Stop Loss",
  death_cross: "Death Cross",
  ema_bear_cross: "EMA Bear Cross",
  rsi_overbought: "RSI > 80",
  rsi_below_sma: "RSI < SMA",
  end_of_data: "End of Data",
};


export default function Home() {
  const [strategy, setStrategy] = useState("ema");
  const [pair, setPair] = useState("BTC/USDT");
  const [timeframe, setTimeframe] = useState("4h");
  const [candleLimit, setCandleLimit] = useState(250);

  const isRsi = strategy === "rsi";
  const isPullback = strategy === "pullback";
  const isCombined = strategy === "combined";
  const usesFixed1h = isRsi || isPullback || isCombined;

  const [showEmaFast, setShowEmaFast] = useState(true);
  const [showEmaSlow, setShowEmaSlow] = useState(true);
  const [showSignals, setShowSignals] = useState(true);
  const [showVolume, setShowVolume] = useState(false);
  const [showRsi, setShowRsi] = useState(true);
  const [showChande, setShowChande] = useState(true);
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
  const [tradeReasonFilter, setTradeReasonFilter] = useState("all");
  const [logLines, setLogLines] = useState([]);
  const [toast, setToast] = useState(null);

  const loadChart = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url;
      if (isRsi) url = `/api/rsi-signals?pair=${encodeURIComponent(pair)}&limit=${candleLimit}`;
      else if (isPullback) url = `/api/pullback-signals?pair=${encodeURIComponent(pair)}&limit=${candleLimit}`;
      else if (isCombined) url = `/api/combined-signals?pair=${encodeURIComponent(pair)}&limit=${candleLimit}`;
      else url = `/api/chart-data?pair=${encodeURIComponent(pair)}&timeframe=${timeframe}&limit=${candleLimit}`;
      if (focusDate) url += `&around=${encodeURIComponent(focusDate)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCandles(data.candles);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [pair, timeframe, candleLimit, focusDate, isRsi, isPullback, isCombined]);

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
        `/api/backtest?pair=${encodeURIComponent(pair)}&start=${backtestStart}&end=${backtestEnd}&strategy=${strategy}`
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBacktest(data);
      setTradeReasonFilter("all");
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
          Strategy
          <select
            className="mt-1 w-full bg-[#131722] border border-[#2a2d3e] rounded px-2 py-1"
            value={strategy}
            onChange={(e) => {
              setStrategy(e.target.value);
              setFocusDate(null);
              setFocusedTradeKey(null);
            }}
          >
            <option value="ema">EMA 50/200 Cross</option>
            <option value="rsi">RSI + ChandeMO (Long only)</option>
            <option value="pullback">CMO-EMA Pullback (Long only)</option>
            <option value="combined">Combined RSI+CMO+EMA (Long only)</option>
          </select>
        </label>

        {isRsi && (
          <div className="text-xs text-zinc-500 bg-[#131722] border border-[#2a2d3e] rounded px-2 py-1.5 leading-relaxed">
            RSI 14 on 4H · ChandeMO 4 on 1H · long only. Timeframe and EMA controls are fixed for this strategy.
          </div>
        )}
        {isPullback && (
          <div className="text-xs text-zinc-500 bg-[#131722] border border-[#2a2d3e] rounded px-2 py-1.5 leading-relaxed">
            EMA 50/200 + CMO 4, all on 1H · long only. Entry needs EMA 50 &gt; EMA 200 and CMO having
            risen from ≤ −95 into the −70..−90 band. Timeframe is fixed for this strategy.
          </div>
        )}
        {isCombined && (
          <div className="text-xs text-zinc-500 bg-[#131722] border border-[#2a2d3e] rounded px-2 py-1.5 leading-relaxed">
            Every condition from both other strategies at once: EMA 50 &gt; EMA 200 (1H), RSI(4H) above
            its SMA / rising / under 80, and CMO(1H) risen from ≤ −95 into the −70..−90 band. Very
            selective — few signals by design. Timeframe is fixed for this strategy.
          </div>
        )}

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

        <label className={`block text-sm ${usesFixed1h ? "opacity-40" : ""}`}>
          Timeframe
          <select
            className="mt-1 w-full bg-[#131722] border border-[#2a2d3e] rounded px-2 py-1 disabled:cursor-not-allowed"
            value={usesFixed1h ? "1h" : timeframe}
            disabled={usesFixed1h}
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

        <label className={`flex items-center gap-2 text-sm ${isRsi ? "opacity-40" : ""}`}>
          <input type="checkbox" checked={!isRsi && showEmaFast} disabled={isRsi} onChange={(e) => setShowEmaFast(e.target.checked)} />
          EMA Fast {(isPullback || isCombined) && "(50)"}
        </label>
        <label className={`flex items-center gap-2 text-sm ${isRsi ? "opacity-40" : ""}`}>
          <input type="checkbox" checked={!isRsi && showEmaSlow} disabled={isRsi} onChange={(e) => setShowEmaSlow(e.target.checked)} />
          EMA Slow {(isPullback || isCombined) && "(200)"}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showSignals} onChange={(e) => setShowSignals(e.target.checked)} />
          Buy/Sell Signals
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showVolume} onChange={(e) => setShowVolume(e.target.checked)} />
          Volume
        </label>
        {(isRsi || isCombined) && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showRsi} onChange={(e) => setShowRsi(e.target.checked)} />
            RSI overlay
          </label>
        )}
        {(isRsi || isPullback || isCombined) && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showChande} onChange={(e) => setShowChande(e.target.checked)} />
            {isRsi ? "ChandeMO overlay" : "CMO overlay"}
          </label>
        )}

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
        {isRsi && (
          <p className="text-xs text-zinc-500">
            RSI backtests run on 1H candles and can take a while over long ranges.
          </p>
        )}
      </aside>

      <main className="flex-1 p-4 space-y-4 overflow-y-auto">
        <h1 className="text-xl font-semibold">
          {isRsi && "RSI + ChandeMO Crypto Bot · Long only"}
          {isPullback && "CMO-EMA Pullback Crypto Bot · Long only"}
          {isCombined && "Combined RSI+CMO+EMA Crypto Bot · Long only"}
          {strategy === "ema" && "EMA 50/200 Crypto Bot"}
        </h1>

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
            {isRsi && (
              <>
                <Metric label="RSI (4H)" value={last.rsi != null ? last.rsi.toFixed(1) : "—"} sub="length 14" valueColor={last.rsi > 80 ? "text-red-400" : "text-zinc-100"} />
                <Metric label="RSI SMA" value={last.rsiSma != null ? last.rsiSma.toFixed(1) : "—"} sub="length 14" />
                <Metric label="ChandeMO (1H)" value={last.chande != null ? last.chande.toFixed(1) : "—"} sub="length 4" valueColor={last.chande >= -100 && last.chande <= -50 ? "text-amber-400" : "text-zinc-100"} />
              </>
            )}
            {isPullback && (
              <>
                <Metric label="EMA Fast" value={last.emaFast ? `$${last.emaFast.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "-"} sub="50-period" />
                <Metric label="EMA Slow" value={last.emaSlow ? `$${last.emaSlow.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "-"} sub="200-period" />
                <Metric label="CMO (1H)" value={last.cmo != null ? last.cmo.toFixed(1) : "—"} sub="length 4" valueColor={last.cmo >= -90 && last.cmo <= -70 ? "text-amber-400" : "text-zinc-100"} />
              </>
            )}
            {isCombined && (
              <>
                <Metric label="EMA Fast" value={last.emaFast ? `$${last.emaFast.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "-"} sub="50-period" />
                <Metric label="EMA Slow" value={last.emaSlow ? `$${last.emaSlow.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "-"} sub="200-period" />
                <Metric label="RSI (4H)" value={last.rsi != null ? last.rsi.toFixed(1) : "—"} sub="length 14" valueColor={last.rsi > 80 ? "text-red-400" : "text-zinc-100"} />
                <Metric label="CMO (1H)" value={last.cmo != null ? last.cmo.toFixed(1) : "—"} sub="length 4" valueColor={last.cmo >= -90 && last.cmo <= -70 ? "text-amber-400" : "text-zinc-100"} />
              </>
            )}
            {strategy === "ema" && (
              <>
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
              </>
            )}
            <Metric label="24h High" value={`$${last.high.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} valueColor="text-green-400/90" />
            <Metric label="24h Low" value={`$${last.low.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} valueColor="text-red-400/90" />
          </div>
        )}

        {isRsi && last?.checks && (
          <div className="bg-[#1e222d] border border-[#2a2d3e] rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Entry Conditions · latest closed candle</h3>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${last.inPosition ? "bg-green-900/40 text-green-400" : "bg-zinc-700/40 text-zinc-400"}`}>
                {last.inPosition ? "In position" : "Flat"}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              <Check label="RSI > SMA" ok={last.checks.rsiAboveSma} detail={`${last.rsi?.toFixed(1) ?? "—"} vs ${last.rsiSma?.toFixed(1) ?? "—"}`} />
              <Check label="RSI rising" ok={last.checks.rsiRising} detail={`prev ${last.rsiPrev?.toFixed(1) ?? "—"}`} />
              <Check label="RSI < 80" ok={last.checks.rsiNotOverbought} detail={last.rsi?.toFixed(1) ?? "—"} />
              <Check label="Chande in −100..−50" ok={last.checks.chandeInZone} detail={last.chande?.toFixed(1) ?? "—"} />
              <Check label="Chande U-turn" ok={last.checks.chandeUturn} detail="3-candle bottom" />
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              All five must pass on a closed candle to open a long. Once open, entry conditions stop being
              checked — the marker stays until an exit fires.
            </p>
          </div>
        )}

        {isPullback && last?.checks && (
          <div className="bg-[#1e222d] border border-[#2a2d3e] rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Entry Conditions · latest closed candle</h3>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${last.inPosition ? "bg-green-900/40 text-green-400" : "bg-zinc-700/40 text-zinc-400"}`}>
                {last.inPosition ? "In position" : "Flat"}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <Check label="EMA 50 > EMA 200" ok={last.checks.emaBullish} detail={`${last.emaFast?.toFixed(0) ?? "—"} vs ${last.emaSlow?.toFixed(0) ?? "—"}`} />
              <Check label="CMO in −70..−90" ok={last.checks.cmoInTargetBand} detail={last.cmo?.toFixed(1) ?? "—"} />
              <Check label="CMO rising" ok={last.checks.cmoRisingIntoBand} detail="vs prev candle" />
              <Check label="CMO from ≤ −95" ok={last.checks.cmoCameFromExtreme} detail="within lookback" />
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              All four must pass on a closed candle to open a long. Once open, entry conditions stop being
              checked — the marker stays until an exit fires.
            </p>
          </div>
        )}

        {isCombined && last?.checks && (
          <div className="bg-[#1e222d] border border-[#2a2d3e] rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Entry Conditions · latest closed candle</h3>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${last.inPosition ? "bg-green-900/40 text-green-400" : "bg-zinc-700/40 text-zinc-400"}`}>
                {last.inPosition ? "In position" : "Flat"}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <Check label="EMA 50 > EMA 200" ok={last.checks.emaBullish} detail={`${last.emaFast?.toFixed(0) ?? "—"} vs ${last.emaSlow?.toFixed(0) ?? "—"}`} />
              <Check label="RSI > SMA" ok={last.checks.rsiAboveSma} detail={`${last.rsi?.toFixed(1) ?? "—"} vs ${last.rsiSma?.toFixed(1) ?? "—"}`} />
              <Check label="RSI rising" ok={last.checks.rsiRising} detail="4H" />
              <Check label="RSI < 80" ok={last.checks.rsiNotOverbought} detail={last.rsi?.toFixed(1) ?? "—"} />
              <Check label="CMO in −70..−90" ok={last.checks.cmoInTargetBand} detail={last.cmo?.toFixed(1) ?? "—"} />
              <Check label="CMO rising" ok={last.checks.cmoRisingIntoBand} detail="vs prev candle" />
              <Check label="CMO from ≤ −95" ok={last.checks.cmoCameFromExtreme} detail="within lookback" />
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              All seven must pass on a closed candle to open a long — every condition from both source
              strategies at once. Once open, entry conditions stop being checked — the marker stays until
              an exit fires.
            </p>
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
              showEmaFast={!isRsi && showEmaFast}
              showEmaSlow={!isRsi && showEmaSlow}
              showSignals={showSignals}
              showVolume={showVolume}
              showRsi={(isRsi || isCombined) && showRsi}
              showChande={(isRsi || isPullback || isCombined) && showChande}
              pair={pair}
              timeframe={usesFixed1h ? "1h" : timeframe}
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

        {isRsi && (showRsi || showChande) && (
          <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400">
            {showRsi && (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4 bg-[#a78bfa]" /> RSI 14 · 4H
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4 bg-[#64748b]" /> RSI SMA 14
                </span>
              </>
            )}
            {showChande && (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 bg-[#f39c12]" /> ChandeMO 4 · 1H
              </span>
            )}
            <span className="text-zinc-600">overlaid on their own scales</span>
          </div>
        )}

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
              <div className="flex items-center gap-2">
                <label className="text-xs text-zinc-400">
                  Filter by reason
                  <select
                    className="ml-2 bg-[#131722] border border-[#2a2d3e] rounded px-2 py-1 text-sm"
                    value={tradeReasonFilter}
                    onChange={(e) => setTradeReasonFilter(e.target.value)}
                  >
                    <option value="all">All ({backtest.trades.length})</option>
                    {[...new Set(backtest.trades.map((t) => t.reason))].map((reason) => (
                      <option key={reason} value={reason}>
                        {REASON_LABELS[reason] || reason} ({backtest.trades.filter((t) => t.reason === reason).length})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left text-zinc-400 border-b border-[#2a2d3e]">
                      <th className="py-2 pr-4 font-medium">Date</th>
                      <th className="py-2 pr-4 font-medium">Type</th>
                      <th className="py-2 pr-4 font-medium text-right">Price</th>
                      <th className="py-2 pr-4 font-medium text-right">Qty</th>
                      {backtest.strategy === "rsi" && (
                        <>
                          <th className="py-2 pr-4 font-medium text-right">RSI</th>
                          <th className="py-2 pr-4 font-medium text-right">RSI SMA</th>
                          <th className="py-2 pr-4 font-medium text-right">Chande</th>
                          <th className="py-2 pr-4 font-medium text-right">Bars</th>
                        </>
                      )}
                      {backtest.strategy === "pullback" && (
                        <>
                          <th className="py-2 pr-4 font-medium text-right">EMA Fast</th>
                          <th className="py-2 pr-4 font-medium text-right">EMA Slow</th>
                          <th className="py-2 pr-4 font-medium text-right">CMO</th>
                          <th className="py-2 pr-4 font-medium text-right">Bars</th>
                        </>
                      )}
                      {backtest.strategy === "combined" && (
                        <>
                          <th className="py-2 pr-4 font-medium text-right">EMA Fast</th>
                          <th className="py-2 pr-4 font-medium text-right">EMA Slow</th>
                          <th className="py-2 pr-4 font-medium text-right">RSI</th>
                          <th className="py-2 pr-4 font-medium text-right">CMO</th>
                          <th className="py-2 pr-4 font-medium text-right">Bars</th>
                        </>
                      )}
                      {backtest.strategy === "ema" && (
                        <>
                          <th className="py-2 pr-4 font-medium text-right">EMA Fast</th>
                          <th className="py-2 pr-4 font-medium text-right">EMA Slow</th>
                        </>
                      )}
                      <th className="py-2 pr-4 font-medium text-right">PnL</th>
                      <th className="py-2 pr-4 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backtest.trades
                      .map((t, i) => ({ t, i }))
                      .filter(({ t }) => tradeReasonFilter === "all" || t.reason === tradeReasonFilter)
                      .map(({ t, i }) => {
                      const isBuy = t.type === "BUY";
                      const isWin = (t.pnl || 0) > 0;
                      const reasonStyles = REASON_STYLES;
                      const reasonLabels = REASON_LABELS;
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
                          {backtest.strategy === "rsi" && (
                            <>
                              <td className="py-2 pr-4 text-right tabular-nums text-violet-400/90">{t.rsi ?? "—"}</td>
                              <td className="py-2 pr-4 text-right tabular-nums text-zinc-400">{t.rsiSma ?? "—"}</td>
                              <td className="py-2 pr-4 text-right tabular-nums text-amber-400/90">{t.chande ?? "—"}</td>
                              <td className="py-2 pr-4 text-right tabular-nums text-zinc-400">{t.barsHeld ?? "—"}</td>
                            </>
                          )}
                          {backtest.strategy === "pullback" && (
                            <>
                              <td className="py-2 pr-4 text-right tabular-nums text-amber-400/80">
                                {t.emaFast != null ? `$${t.emaFast.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                              </td>
                              <td className="py-2 pr-4 text-right tabular-nums text-blue-400/80">
                                {t.emaSlow != null ? `$${t.emaSlow.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                              </td>
                              <td className="py-2 pr-4 text-right tabular-nums text-amber-400/90">{t.cmo ?? "—"}</td>
                              <td className="py-2 pr-4 text-right tabular-nums text-zinc-400">{t.barsHeld ?? "—"}</td>
                            </>
                          )}
                          {backtest.strategy === "combined" && (
                            <>
                              <td className="py-2 pr-4 text-right tabular-nums text-amber-400/80">
                                {t.emaFast != null ? `$${t.emaFast.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                              </td>
                              <td className="py-2 pr-4 text-right tabular-nums text-blue-400/80">
                                {t.emaSlow != null ? `$${t.emaSlow.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                              </td>
                              <td className="py-2 pr-4 text-right tabular-nums text-violet-400/90">{t.rsi ?? "—"}</td>
                              <td className="py-2 pr-4 text-right tabular-nums text-amber-400/90">{t.cmo ?? "—"}</td>
                              <td className="py-2 pr-4 text-right tabular-nums text-zinc-400">{t.barsHeld ?? "—"}</td>
                            </>
                          )}
                          {backtest.strategy === "ema" && (
                            <>
                              <td className="py-2 pr-4 text-right tabular-nums text-amber-400/80">
                                {t.emaFast != null ? `$${t.emaFast.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                              </td>
                              <td className="py-2 pr-4 text-right tabular-nums text-blue-400/80">
                                {t.emaSlow != null ? `$${t.emaSlow.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                              </td>
                            </>
                          )}
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
                      onClick={() => { setBacktest(run); setTradeReasonFilter("all"); }}
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

function Check({ label, ok, detail }) {
  return (
    <div className={`flex items-start gap-2 rounded px-2 py-1.5 ${ok ? "bg-green-900/20" : "bg-[#131722]"}`}>
      <span className={`mt-0.5 text-xs ${ok ? "text-green-400" : "text-zinc-600"}`}>{ok ? "✓" : "✗"}</span>
      <div className="min-w-0">
        <div className={`text-xs font-medium ${ok ? "text-green-400" : "text-zinc-400"}`}>{label}</div>
        <div className="text-xs text-zinc-500 truncate">{detail}</div>
      </div>
    </div>
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
