"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Chart from "./components/Chart.jsx";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
const WS_BASE = API_BASE.replace(/^http/, "ws");

// Number/date formatting is pinned to a fixed locale and time zone. The bare
// `toLocaleString()` default follows the ambient locale, which differs between
// the Node server and the browser (e.g. "10.000" vs "10,000") and breaks
// hydration.
const LOCALE = "en-US";
const TIME_ZONE = "UTC";

function money(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return "-";
  return value.toLocaleString(LOCALE, { maximumFractionDigits: digits });
}

function formatDate(value) {
  return new Date(value).toLocaleDateString(LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: TIME_ZONE,
  });
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
}

function formatDateTime(value) {
  return new Date(value).toLocaleString(LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
}

// UTC calendar date, e.g. "2026-09-12" — used as "today" for the backtest
// range so it never goes stale like a hardcoded default would.
function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

const PAIRS = ["BTC/USDT", "ETH/USDT", "BNB/USDT", "SOL/USDT", "AVAX/USDT", "XRP/USDT", "ADA/USDT"];

// Rolling 40-point-wide CMO zones, sliding from the extreme (-100..-60) up to
// (-20..+20).
const ZONE_PRESETS = Array.from({ length: 81 }, (_, i) => {
  const low = -100 + i;
  const high = low + 40;
  return { low, high, label: `${low} → ${high > 0 ? "+" + high : high}` };
});

const RR_RATIOS = [1, 2, 3];

const REASON_STYLES = {
  cmo_ema_pullback: "bg-blue-900/40 text-blue-400",
  take_profit: "bg-green-900/40 text-green-400",
  stop_loss: "bg-red-900/40 text-red-400",
  end_of_data: "bg-zinc-700/40 text-zinc-400",
};

const REASON_LABELS = {
  cmo_ema_pullback: "CMO + EMA",
  take_profit: "Target Hit",
  stop_loss: "Stopped Out",
  end_of_data: "End of Data",
};


export default function Home() {
  const [pair, setPair] = useState("BTC/USDT");
  const [candleLimit, setCandleLimit] = useState(1000);
  const [cmoLength, setCmoLength] = useState(18);
  const [emaLength, setEmaLength] = useState(200);
  const [zoneLow, setZoneLow] = useState(-100);
  const [zoneHigh, setZoneHigh] = useState(-30);
  const [selectedZones, setSelectedZones] = useState([]);
  const [cooldownBars, setCooldownBars] = useState(0);
  const [riskPerTrade, setRiskPerTrade] = useState(0.02);
  const [stopLossPct, setStopLossPct] = useState(0.02);
  const [riskRewardRatio, setRiskRewardRatio] = useState(2);
  const [initialCapital, setInitialCapital] = useState(10000);

  const [showEmaFast, setShowEmaFast] = useState(true);
  const [showBuySignals, setShowBuySignals] = useState(true);
  const [showVolume, setShowVolume] = useState(false);
  const [showChande, setShowChande] = useState(true);
  const [paperMode, setPaperMode] = useState(false);

  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [focusDate, setFocusDate] = useState(null);
  const [focusedTradeKey, setFocusedTradeKey] = useState(null);

  // Live ticker, pushed from the server every few seconds. Candles stay on
  // closed bars; this is the only value that tracks price in real time.
  const [livePrice, setLivePrice] = useState(null);
  const [liveStatus, setLiveStatus] = useState("connecting");
  const wsRef = useRef(null);

  const [positions, setPositions] = useState({});
  const [backtest, setBacktest] = useState(null);
  // Every run evaluates 1:1, 1:2 and 1:3 so the ratios can be compared
  // directly; `riskRewardRatio` then only selects which one is detailed below.
  const [backtestByRatio, setBacktestByRatio] = useState(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [backtestStart, setBacktestStart] = useState("2022-01-01");
  const [backtestEnd, setBacktestEnd] = useState(todayUTC());
  const [backtestHistory, setBacktestHistory] = useState([]);
  const [tradeReasonFilter, setTradeReasonFilter] = useState("all");
  const [logLines, setLogLines] = useState([]);
  const [toast, setToast] = useState(null);

  const loadChart = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const zonesQuery = selectedZones.length > 1 ? `&zones=${encodeURIComponent(JSON.stringify(selectedZones))}` : "";
      let url = `${API_BASE}/api/pullback-signals?pair=${encodeURIComponent(pair)}&limit=${candleLimit}&cmoLength=${cmoLength}&emaLength=${emaLength}&zoneLow=${zoneLow}&zoneHigh=${zoneHigh}&cooldownBars=${cooldownBars}${zonesQuery}`;
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
  }, [pair, candleLimit, focusDate, cmoLength, emaLength, zoneLow, zoneHigh, cooldownBars, selectedZones]);

  const loadPositions = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/positions`);
    const data = await res.json();
    setPositions(data.positions || {});
  }, []);

  const loadLog = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/log`);
    const data = await res.json();
    setLogLines(data.lines || []);
  }, []);

  const loadBacktestHistory = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/backtest-history`);
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

  // Subscribe to the server's ticker stream for the selected pair. Reconnects
  // with a fixed backoff so a dropped socket recovers without a reload.
  useEffect(() => {
    let closed = false;
    let retry;

    setLivePrice(null);
    setLiveStatus("connecting");

    function connect() {
      if (closed) return;
      let ws;
      try {
        ws = new WebSocket(`${WS_BASE}/ws`);
      } catch {
        setLiveStatus("offline");
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        setLiveStatus("live");
        ws.send(JSON.stringify({ type: "subscribe", pair }));
      };

      ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.type === "ticker" && msg.pair === pair && typeof msg.price === "number") {
          setLivePrice({ price: msg.price, time: msg.time, source: msg.source });
          setLiveStatus("live");
        } else if (msg.type === "error") {
          setLiveStatus("offline");
        }
      };

      ws.onerror = () => setLiveStatus("offline");

      ws.onclose = () => {
        if (closed) return;
        setLiveStatus("offline");
        retry = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "unsubscribe", pair }));
        ws.close();
      } else if (ws) {
        ws.close();
      }
      wsRef.current = null;
    };
  }, [pair]);

  async function runBotOnce() {
    setToast("Running bot cycle...");
    try {
      await fetch(`${API_BASE}/api/run-bot`, {
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
      const zonesParam = selectedZones.length > 1 ? `&zones=${encodeURIComponent(JSON.stringify(selectedZones))}` : "";
      const shared = `&cmoLength=${cmoLength}&emaLength=${emaLength}&zoneLow=${zoneLow}&zoneHigh=${zoneHigh}&cooldownBars=${cooldownBars}&riskPerTrade=${riskPerTrade}&initialCapital=${initialCapital}&stopLossPct=${stopLossPct}${zonesParam}`;

      const runs = await Promise.all(
        RR_RATIOS.map(async (ratio) => {
          const res = await fetch(
            `${API_BASE}/api/backtest?pair=${encodeURIComponent(pair)}&start=${backtestStart}&end=${backtestEnd}&riskRewardRatio=${ratio}${shared}`
          );
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          return [ratio, data];
        })
      );

      const byRatio = Object.fromEntries(runs);
      setBacktestByRatio(byRatio);

      const selected = byRatio[riskRewardRatio];
      setBacktest(selected);
      setTradeReasonFilter("all");
      loadBacktestHistory();
      if (selected?.trades?.length) {
        setFocusDate(selected.trades[0].date);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBacktestLoading(false);
    }
  }

  // Switching ratio after a run swaps the detail view without refetching.
  function selectRatio(ratio) {
    setRiskRewardRatio(ratio);
    if (backtestByRatio?.[ratio]) {
      setBacktest(backtestByRatio[ratio]);
      setTradeReasonFilter("all");
      setFocusedTradeKey(null);
    }
  }

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const priceChangePct = last && prev ? ((last.close - prev.close) / prev.close) * 100 : 0;
  // Live price is compared against the last CLOSED candle, so the delta shows
  // how far the market has moved since that bar finished.
  const livePrice_ = livePrice?.price ?? null;
  const liveChangePct = livePrice_ != null && last ? ((livePrice_ - last.close) / last.close) * 100 : null;

  return (
    <div className="flex min-h-screen bg-[#131722] text-[#d1d4dc]">
      <aside className="w-64 shrink-0 bg-[#1e222d] border-r border-[#2a2d3e] p-4 space-y-4">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-zinc-400">Controls</h2>

        <div className="text-xs text-zinc-500 bg-[#131722] border border-[#2a2d3e] rounded px-2 py-1.5 leading-relaxed">
          Strategy: CMO-EMA Pullback (Long only)
        </div>

        <div className="text-xs text-zinc-500 bg-[#131722] border border-[#2a2d3e] rounded px-2 py-1.5 leading-relaxed">
          EMA {emaLength} + CMO {cmoLength}, all on 1H · long only. Entry needs price above the EMA and CMO
          sitting between {zoneLow} and {zoneHigh} (last condition checked). Timeframe is fixed for this strategy.
        </div>
        <label className="block text-sm">
          EMA length: <span className="text-zinc-100 font-medium">{emaLength}</span>
          <input
            type="range"
            min="5"
            max="200"
            step="1"
            value={emaLength}
            onChange={(e) => setEmaLength(Number(e.target.value))}
            className="w-full accent-emerald-500"
          />
        </label>
        <label className="block text-sm">
          CMO length: <span className="text-zinc-100 font-medium">{cmoLength}</span>
          <input
            type="range"
            min="2"
            max="30"
            step="1"
            value={cmoLength}
            onChange={(e) => setCmoLength(Number(e.target.value))}
            className="w-full accent-emerald-500"
          />
        </label>
        <div className="text-sm">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span>CMO zone presets</span>
            {selectedZones.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedZones([])}
                className="text-xs text-zinc-500 hover:text-zinc-300 shrink-0"
              >
                Clear
              </button>
            )}
          </div>
          {selectedZones.length > 0 && (
            <span className="inline-block text-xs font-medium text-emerald-400 bg-emerald-400/10 rounded-full px-2 py-0.5 mb-1.5">
              {selectedZones.length} selected
            </span>
          )}
          <div className="max-h-56 overflow-y-auto border border-[#2a2d3e] rounded-lg divide-y divide-[#1e2130] bg-[#0d1017]">
            {ZONE_PRESETS.map((z) => {
              const checked = selectedZones.some(([l, h]) => l === z.low && h === z.high);
              return (
                <label
                  key={z.label}
                  className={`flex items-center gap-2 text-xs px-2 py-1 cursor-pointer transition-colors ${
                    checked ? "bg-emerald-500/10 text-emerald-300" : "text-zinc-400 hover:bg-[#1c1f2e] hover:text-zinc-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      let next;
                      if (e.target.checked) next = [...selectedZones, [z.low, z.high]];
                      else next = selectedZones.filter(([l, h]) => !(l === z.low && h === z.high));
                      setSelectedZones(next);
                      if (next.length) {
                        setZoneLow(next[0][0]);
                        setZoneHigh(next[0][1]);
                      }
                    }}
                    className="accent-emerald-500 shrink-0"
                  />
                  <span className="font-mono tabular-nums whitespace-nowrap">{z.label}</span>
                </label>
              );
            })}
          </div>
          {selectedZones.length > 1 && (
            <span className="text-xs text-zinc-500 mt-1 inline-block">Matches if CMO falls in ANY selected zone</span>
          )}
        </div>

        <label className="block text-sm">
          Cooldown (bars): <span className="text-zinc-100 font-medium">{cooldownBars}</span>
          <input
            type="range"
            min="0"
            max="200"
            step="1"
            value={cooldownBars}
            onChange={(e) => setCooldownBars(Number(e.target.value))}
            className="w-full accent-emerald-500"
          />
        </label>

        <label className="block text-sm">
          Risk per trade: <span className="text-zinc-100 font-medium">{(riskPerTrade * 100).toFixed(1)}%</span>
          <input
            type="range"
            min="0.005"
            max="0.2"
            step="0.005"
            value={riskPerTrade}
            onChange={(e) => setRiskPerTrade(Number(e.target.value))}
            className="w-full accent-emerald-500"
          />
        </label>

        <label className="block text-sm">
          Stop loss: <span className="text-zinc-100 font-medium">{(stopLossPct * 100).toFixed(1)}%</span>
          <input
            type="range"
            min="0.005"
            max="0.1"
            step="0.005"
            value={stopLossPct}
            onChange={(e) => setStopLossPct(Number(e.target.value))}
            className="w-full accent-emerald-500"
          />
          {stopLossPct < riskPerTrade && (
            <span className="block text-[11px] text-amber-400/90 mt-1">
              Stop is tighter than risk per trade — positions become unaffordable and no trades open.
            </span>
          )}
        </label>

        <label className="block text-sm">
          Risk : Reward <span className="text-zinc-100 font-medium">1:{riskRewardRatio}</span>
          <span className="block text-[11px] text-zinc-500">All three run on every backtest</span>
          <div className="mt-1 flex gap-1">
            {RR_RATIOS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => selectRatio(r)}
                className={`flex-1 rounded px-2 py-1 text-xs border ${
                  riskRewardRatio === r
                    ? "bg-emerald-600/30 border-emerald-500 text-emerald-300"
                    : "bg-[#131722] border-[#2a2d3e] text-zinc-400 hover:border-zinc-600"
                }`}
              >
                1:{r}
              </button>
            ))}
          </div>
        </label>

        <label className="block text-sm">
          Initial capital: <span className="text-zinc-100 font-medium">${money(initialCapital, 0)}</span>
          <input
            type="range"
            min="1000"
            max="100000"
            step="1000"
            value={initialCapital}
            onChange={(e) => setInitialCapital(Number(e.target.value))}
            className="w-full accent-emerald-500"
          />
        </label>

        <label className="block text-sm">
          Pair
          <select
            className="mt-1 w-full bg-[#131722] border border-[#2a2d3e] rounded px-2 py-1"
            value={pair}
            onChange={(e) => {
              setPair(e.target.value);
              setFocusDate(null);
              setFocusedTradeKey(null);
            }}
          >
            {PAIRS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          Candles: {candleLimit}
          <input
            type="range"
            min={50}
            max={1000}
            step={50}
            value={candleLimit}
            onChange={(e) => setCandleLimit(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </label>

        <hr className="border-[#2a2d3e]" />

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showEmaFast} onChange={(e) => setShowEmaFast(e.target.checked)} />
          {`EMA (${emaLength})`}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showBuySignals} onChange={(e) => setShowBuySignals(e.target.checked)} />
          Buy Signals
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showVolume} onChange={(e) => setShowVolume(e.target.checked)} />
          Volume
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showChande} onChange={(e) => setShowChande(e.target.checked)} />
          CMO overlay
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
            max={todayUTC()}
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
        <h1 className="text-xl font-semibold">CMO-EMA Pullback Crypto Bot · Long only</h1>

        {toast && <div className="bg-green-900/50 border border-green-700 rounded px-3 py-2 text-sm">{toast}</div>}
        {error && <div className="bg-red-900/50 border border-red-700 rounded px-3 py-2 text-sm">{error}</div>}

        {last && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Metric
              label={
                <span className="inline-flex items-center gap-1.5">
                  Live Price
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full ${
                      liveStatus === "live"
                        ? "bg-green-400 animate-pulse"
                        : liveStatus === "connecting"
                        ? "bg-amber-400"
                        : "bg-red-500"
                    }`}
                    title={
                      liveStatus === "live"
                        ? `Streaming${livePrice?.source ? ` from ${livePrice.source}` : ""}`
                        : liveStatus === "connecting"
                        ? "Connecting to price stream"
                        : "Price stream offline — showing last closed candle"
                    }
                  />
                </span>
              }
              value={`$${money(livePrice_ ?? last.close)}`}
              delta={
                liveChangePct != null
                  ? `${liveChangePct >= 0 ? "+" : ""}${liveChangePct.toFixed(2)}%`
                  : `${priceChangePct >= 0 ? "+" : ""}${priceChangePct.toFixed(2)}%`
              }
              deltaPositive={(liveChangePct ?? priceChangePct) >= 0}
              sub={liveChangePct != null ? "since last close" : "last closed candle"}
              accent
            />
            <Metric
              label="Last Close"
              value={`$${money(last.close)}`}
              sub={`1H bar · ${formatTime(last.time)}`}
            />
            <Metric label="EMA" value={last.ema ? `$${money(last.ema)}` : "-"} sub={`${emaLength}-period`} />
            <Metric label="CMO (1H)" value={last.cmo != null ? last.cmo.toFixed(1) : "—"} sub={`length ${cmoLength}`} valueColor={last.cmo >= zoneLow && last.cmo <= zoneHigh ? "text-amber-400" : "text-zinc-100"} />
            <Metric label="24h High" value={`$${money(last.high)}`} valueColor="text-green-400/90" />
            <Metric label="24h Low" value={`$${money(last.low)}`} valueColor="text-red-400/90" />
          </div>
        )}

        {last?.checks && (
          <div className="bg-[#1e222d] border border-[#2a2d3e] rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Entry Conditions · latest closed candle</h3>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${last.inPosition ? "bg-green-900/40 text-green-400" : "bg-zinc-700/40 text-zinc-400"}`}>
                {last.inPosition ? "In position" : "Flat"}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              <Check label={`Price > EMA ${emaLength}`} ok={last.checks.priceAboveEma} detail={`${last.close?.toFixed(0) ?? "—"} vs ${last.ema?.toFixed(0) ?? "—"}`} />
              <Check label={`CMO ${zoneLow}..${zoneHigh}`} ok={last.checks.cmoInZone} detail={last.cmo?.toFixed(1) ?? "—"} />
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              Both must pass on a closed candle to open a long. Once open, entry conditions stop being
              checked — the marker stays until an exit fires.
            </p>
          </div>
        )}

        <div ref={chartSectionRef} className="flex items-center justify-between">
          <h2 className="font-semibold">
            {focusDate ? (
              <>
                Viewing trade context ·{" "}
                <span className="text-zinc-400 font-normal">
                  {formatDate(focusDate)}
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
              showEmaSlow={false}
              showBuySignals={showBuySignals}
              showVolume={showVolume}
              showChande={showChande}
              pair={pair}
              timeframe="1h"
            />
          )}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#131722]/60 backdrop-blur-[1px] rounded">
              <div className="flex items-center gap-2 text-sm text-zinc-300 bg-[#1e222d] border border-[#2a2d3e] rounded px-3 py-2">
                <span className="h-3.5 w-3.5 rounded-full border-2 border-zinc-500 border-t-blue-500 animate-spin" />
                Loading {pair} 1h...
              </div>
            </div>
          )}
          {!loading && candles.length === 0 && (
            <div className="h-[520px] flex flex-col items-center justify-center gap-3 text-sm text-zinc-400">
              <span>No candles returned for this range — likely a temporary exchange hiccup.</span>
              <button
                onClick={loadChart}
                className="text-xs bg-blue-600 hover:bg-blue-700 rounded px-3 py-1.5 font-medium text-white"
              >
                Retry
              </button>
            </div>
          )}
        </div>

        {showChande && (
          <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 bg-[#f39c12]" /> CMO {cmoLength} · 1H
            </span>
            <span className="text-zinc-600">overlaid on its own scale</span>
          </div>
        )}

        <p className="text-xs text-zinc-500">🖱 Scroll to zoom · Click & drag to pan</p>

        <section>
          <h2 className="font-semibold mb-2">Open Positions</h2>
          {Object.keys(positions).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-zinc-400 border-b border-[#2a2d3e]">
                    <th className="py-2 pr-4 font-medium">Pair</th>
                    <th className="py-2 pr-4 font-medium text-right">Entry</th>
                    <th className="py-2 pr-4 font-medium text-right">Qty</th>
                    <th className="py-2 pr-4 font-medium">Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(positions).map(([symbol, p]) => (
                    <tr key={symbol} className="border-b border-[#1e2130] hover:bg-[#1a1e29]">
                      <td className="py-2 pr-4 font-medium">{symbol}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">${money(p.entry)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-zinc-400">{p.qty}</td>
                      <td className="py-2 pr-4 text-zinc-400 whitespace-nowrap">
                        {formatDateTime(p.time)}
                      </td>
                    </tr>
                  ))}
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
                {backtest.symbol} · {formatDate(backtest.start)}
                {" → "}
                {formatDate(backtest.end)}
              </div>
              {/* Settings this run actually used, echoed back from the server
                  so the numbers below can never be read against the wrong
                  parameters. */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400 border border-[#2a2d3e] rounded px-3 py-2">
                <span>Risk/trade <span className="text-zinc-200">{(backtest.riskPerTrade * 100).toFixed(1)}%</span></span>
                <span>Stop <span className="text-zinc-200">{(backtest.stopLossPct * 100).toFixed(1)}%</span></span>
                <span>R:R <span className="text-zinc-200">1:{backtest.riskRewardRatio}</span></span>
                <span>Cooldown <span className="text-zinc-200">{backtest.cooldownBars} bars</span></span>
                <span>EMA <span className="text-zinc-200">{backtest.emaLength}</span></span>
                <span>CMO <span className="text-zinc-200">{backtest.cmoLength}</span></span>
                <span>Zone <span className="text-zinc-200">{backtest.zoneLow} → {backtest.zoneHigh}</span></span>
                <span>Data <span className="text-zinc-200">{backtest.source}</span></span>
              </div>

              <div className="grid grid-cols-6 gap-2">
                <Metric label="Initial" value={`$${money(backtest.initialCapital, 0)}`} />
                <Metric label="Final" value={`$${money(backtest.finalCapital, 0)}`} />
                <Metric label="Return" value={`${backtest.returnPct}%`} valueColor={backtest.returnPct >= 0 ? "text-green-400/90" : "text-red-400/90"} />
                <Metric label="Win Rate" value={`${backtest.winRate}%`} />
                <Metric label="Total Trades" value={backtest.totalTrades} />
                <Metric label="W / L" value={`${backtest.wins} / ${backtest.losses}`} />
              </div>

              {backtestByRatio && (
                <div className="border border-[#2a2d3e] rounded p-3 space-y-2">
                  <div className="text-xs font-medium text-zinc-300">
                    Ratio comparison
                    <span className="ml-2 font-normal text-zinc-500">
                      same entries and stop, different targets — click a row to detail it below
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="text-left text-zinc-400 border-b border-[#2a2d3e]">
                          <th className="py-1.5 pr-4 font-medium">R:R</th>
                          <th className="py-1.5 pr-4 font-medium text-right">Trades</th>
                          <th className="py-1.5 pr-4 font-medium text-right">Target</th>
                          <th className="py-1.5 pr-4 font-medium text-right">Stop</th>
                          <th className="py-1.5 pr-4 font-medium text-right">Win %</th>
                          <th className="py-1.5 pr-4 font-medium text-right">Break-even %</th>
                          <th className="py-1.5 pr-4 font-medium text-right">Edge</th>
                          <th className="py-1.5 pr-4 font-medium text-right">Total R</th>
                          <th className="py-1.5 pr-4 font-medium text-right">Expectancy</th>
                          <th className="py-1.5 pr-4 font-medium text-right">Return</th>
                        </tr>
                      </thead>
                      <tbody>
                        {RR_RATIOS.map((r) => {
                          const run = backtestByRatio[r];
                          if (!run?.rStats) return null;
                          const k = run.rStats;
                          const active = riskRewardRatio === r;
                          return (
                            <tr
                              key={r}
                              onClick={() => selectRatio(r)}
                              className={`border-b border-[#1e2130] cursor-pointer hover:bg-[#1a1e29] ${
                                active ? "bg-emerald-900/20 ring-1 ring-inset ring-emerald-500/40" : ""
                              }`}
                            >
                              <td className="py-1.5 pr-4 font-medium text-zinc-200">1:{r}</td>
                              <td className="py-1.5 pr-4 text-right tabular-nums text-zinc-300">{k.resolvedTrades}</td>
                              <td className="py-1.5 pr-4 text-right tabular-nums text-green-400/90">{k.targetHits}</td>
                              <td className="py-1.5 pr-4 text-right tabular-nums text-red-400/90">{k.stopHits}</td>
                              <td className="py-1.5 pr-4 text-right tabular-nums text-zinc-300">{k.winRate}%</td>
                              <td className="py-1.5 pr-4 text-right tabular-nums text-zinc-500">{k.breakEvenWinRate}%</td>
                              <td className={`py-1.5 pr-4 text-right tabular-nums font-medium ${k.edge >= 0 ? "text-green-400" : "text-red-400"}`}>
                                {k.edge > 0 ? "+" : ""}{k.edge}%
                              </td>
                              <td className={`py-1.5 pr-4 text-right tabular-nums ${k.totalR >= 0 ? "text-green-400/90" : "text-red-400/90"}`}>
                                {k.totalR > 0 ? "+" : ""}{k.totalR}
                              </td>
                              <td className={`py-1.5 pr-4 text-right tabular-nums ${k.expectancyR >= 0 ? "text-green-400/90" : "text-red-400/90"}`}>
                                {k.expectancyR > 0 ? "+" : ""}{k.expectancyR}R
                              </td>
                              <td className={`py-1.5 pr-4 text-right tabular-nums font-medium ${run.returnPct >= 0 ? "text-green-400" : "text-red-400"}`}>
                                {run.returnPct > 0 ? "+" : ""}{run.returnPct}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {backtest.rStats && (
                <div className="border border-[#2a2d3e] rounded p-3 space-y-2">
                  <div className="text-xs font-medium text-zinc-300">
                    Fixed 1:{backtest.rStats.riskRewardRatio} performance
                    <span className="ml-2 font-normal text-zinc-500">
                      every trade closes at its target or its stop
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <Metric label="Target hits" value={backtest.rStats.targetHits} valueColor="text-green-400/90" />
                    <Metric label="Stop hits" value={backtest.rStats.stopHits} valueColor="text-red-400/90" />
                    <Metric label="Resolved" value={backtest.rStats.resolvedTrades} sub={backtest.rStats.openAtEnd ? `${backtest.rStats.openAtEnd} open at end` : undefined} />
                    <Metric label="Total R" value={backtest.rStats.totalR > 0 ? `+${backtest.rStats.totalR}` : backtest.rStats.totalR} valueColor={backtest.rStats.totalR >= 0 ? "text-green-400/90" : "text-red-400/90"} />
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <Metric label="Win rate" value={`${backtest.rStats.winRate}%`} />
                    <Metric label="Break-even" value={`${backtest.rStats.breakEvenWinRate}%`} sub="needed at this R:R" />
                    <Metric
                      label="Edge"
                      value={`${backtest.rStats.edge > 0 ? "+" : ""}${backtest.rStats.edge}%`}
                      valueColor={backtest.rStats.edge >= 0 ? "text-green-400/90" : "text-red-400/90"}
                      sub="win rate − break-even"
                    />
                    <Metric
                      label="Expectancy"
                      value={`${backtest.rStats.expectancyR > 0 ? "+" : ""}${backtest.rStats.expectancyR}R`}
                      valueColor={backtest.rStats.expectancyR >= 0 ? "text-green-400/90" : "text-red-400/90"}
                      sub="avg per trade"
                    />
                  </div>

                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Edge is the only figure that says whether there is an advantage: a 1:
                    {backtest.rStats.riskRewardRatio} target needs {backtest.rStats.breakEvenWinRate}% of trades to hit
                    to break even. Gross of fees and slippage — at roughly 0.1% per side,{" "}
                    {backtest.rStats.resolvedTrades} trades would cost about{" "}
                    {(backtest.rStats.resolvedTrades * 0.2).toFixed(0)}% of capital in costs.
                  </p>
                </div>
              )}
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
                      <th className="py-2 pr-4 font-medium text-right">EMA</th>
                      <th className="py-2 pr-4 font-medium text-right">CMO</th>
                      <th className="py-2 pr-4 font-medium text-right">Bars</th>
                      <th className="py-2 pr-4 font-medium text-right">PnL</th>
                      <th className="py-2 pr-4 font-medium text-right">R</th>
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
                            {formatDate(t.date)}
                          </td>
                          <td className="py-2 pr-4">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${isBuy ? "bg-green-900/40 text-green-400" : "bg-red-900/40 text-red-400"}`}>
                              {isBuy ? "BUY" : "SELL"}
                            </span>
                          </td>
                          <td
                            className="py-2 pr-4 text-right tabular-nums"
                            title={isBuy && t.stop != null ? `Stop $${money(t.stop)} · Target $${money(t.target)}` : undefined}
                          >
                            ${money(t.price)}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums text-zinc-400">{t.qty.toFixed(6)}</td>
                          <td className="py-2 pr-4 text-right tabular-nums text-amber-400/80">
                            {t.ema != null ? `$${money(t.ema)}` : "—"}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums text-amber-400/90">{t.cmo ?? "—"}</td>
                          <td className="py-2 pr-4 text-right tabular-nums text-zinc-400">{t.barsHeld ?? "—"}</td>
                          <td className={`py-2 pr-4 text-right tabular-nums font-medium ${isBuy ? "text-zinc-500" : isWin ? "text-green-400" : "text-red-400"}`}>
                            {isBuy ? "—" : `${isWin ? "+" : ""}$${t.pnl.toFixed(2)}`}
                          </td>
                          <td className={`py-2 pr-4 text-right tabular-nums font-medium ${
                            isBuy || t.rMultiple == null ? "text-zinc-500" : t.rMultiple >= 0 ? "text-green-400" : "text-red-400"
                          }`}>
                            {isBuy || t.rMultiple == null ? "—" : `${t.rMultiple > 0 ? "+" : ""}${t.rMultiple.toFixed(2)}R`}
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
          {backtestHistory.filter((run) => (run.strategy || "ema") === "pullback").length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-zinc-400 border-b border-[#2a2d3e]">
                    <th className="py-2 pr-4 font-medium">Run At</th>
                    <th className="py-2 pr-4 font-medium">Strategy</th>
                    <th className="py-2 pr-4 font-medium">Pair</th>
                    <th className="py-2 pr-4 font-medium">Range</th>
                    <th className="py-2 pr-4 font-medium text-right">Return</th>
                    <th className="py-2 pr-4 font-medium text-right">Win Rate</th>
                    <th className="py-2 pr-4 font-medium text-right">Trades</th>
                  </tr>
                </thead>
                <tbody>
                  {backtestHistory.filter((run) => (run.strategy || "ema") === "pullback").map((run, i) => (
                    <tr
                      key={i}
                      onClick={() => { setBacktest(run); setTradeReasonFilter("all"); }}
                      title="Click to load this run"
                      className="border-b border-[#1e2130] cursor-pointer hover:bg-[#1a1e29]"
                    >
                      <td className="py-2 pr-4 text-zinc-400 whitespace-nowrap">
                        {formatDateTime(run.runAt)}
                      </td>
                      <td className="py-2 pr-4 text-zinc-400">{run.strategy || "ema"}</td>
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

        <p className="text-xs text-zinc-500">CMO-EMA Pullback Strategy · OKX · TradingView Lightweight Charts</p>
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
          <td className="py-1.5 px-3 text-right tabular-nums whitespace-nowrap">${money(parsed.price)}</td>
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
