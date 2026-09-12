"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, LineSeries, HistogramSeries, createSeriesMarkers } from "lightweight-charts";

function money(value) {
  return value == null ? "—" : `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

const HOUR_MS = 60 * 60 * 1000;

export default function Chart({ candles, showEmaFast, showEmaSlow, showBuySignals, showVolume, showChande = false, pair, timeframe, livePrice, now }) {
  const containerRef = useRef(null);
  const tooltipRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef({});
  const candlesByTimeRef = useRef(new Map());
  // Shows the "jump to latest" button once the visible range has scrolled
  // away from the most recent candles, mirroring how TradingView-style
  // charts surface it only when it's actually useful.
  const [scrolledAway, setScrolledAway] = useState(false);
  // The last CLOSED candle from `candles`, and the live forming candle built
  // on top of it from ticker updates — tracked in refs (not state) since
  // they're pushed straight into the chart series via update(), not re-render.
  const lastClosedRef = useRef(null);
  const formingCandleRef = useRef(null);

  // Mount chart + series once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      height: 520,
      layout: {
        background: { color: "#131722" },
        textColor: "#d1d4dc",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: "#1e2130" },
        horzLines: { color: "#1e2130" },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: "#2a2d3e" },
      timeScale: {
        borderColor: "#2a2d3e",
        timeVisible: true,
        secondsVisible: false,
      },
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });
    const markers = createSeriesMarkers(candleSeries, []);
    const emaFastSeries = chart.addSeries(LineSeries, {
      color: "#f39c12",
      lineWidth: 2,
      priceLineVisible: false,
      title: "EMA Fast",
    });
    const emaSlowSeries = chart.addSeries(LineSeries, {
      color: "#3498db",
      lineWidth: 2,
      priceLineVisible: false,
      title: "EMA Slow",
    });
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    // ChandeMO lives on its own overlay scale so it can share the candle
    // pane without being flattened by the price axis. Kept semi-transparent
    // and confined near the bottom so it reads as a background indicator
    // rather than competing visually with the candles.
    const chandeSeries = chart.addSeries(LineSeries, {
      color: "rgba(243, 156, 18, 0.45)",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      priceScaleId: "chande",
      title: "ChandeMO 4 (1H)",
    });
    chandeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0.02 } });

    seriesRef.current = {
      candleSeries,
      markers,
      emaFastSeries,
      emaSlowSeries,
      volumeSeries,
      chandeSeries,
    };

    // Hover tooltip for BUY signal candles only: OHLC, change, volume, and
    // indicator readings at the moment the signal fired. Hidden on every
    // other candle so it doesn't clutter routine chart browsing.
    chart.subscribeCrosshairMove((param) => {
      const tooltip = tooltipRef.current;
      if (!tooltip) return;

      const c = param.time != null ? candlesByTimeRef.current.get(param.time) : null;
      if (!param.point || !c || c.signal !== 1) {
        tooltip.style.display = "none";
        return;
      }

      const changePct = c.open ? ((c.close - c.open) / c.open) * 100 : 0;
      const changeColor = changePct >= 0 ? "text-green-400" : "text-red-400";
      const dateLabel = new Date(c.time).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      });

      const row = (label, value, cls = "") =>
        `<div class="flex justify-between gap-4"><span class="text-zinc-400">${label}</span><span class="${cls}">${value}</span></div>`;

      tooltip.innerHTML = `
        <div class="font-semibold text-zinc-200 mb-1">${dateLabel} UTC</div>
        <div class="font-semibold text-green-400 mb-1">BUY signal</div>
        ${row("Open", money(c.open))}
        ${row("High", money(c.high))}
        ${row("Low", money(c.low))}
        ${row("Close", money(c.close), changeColor)}
        ${row("Change", `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`, changeColor)}
        ${c.volume != null ? row("Volume", c.volume.toLocaleString("en-US", { maximumFractionDigits: 2 })) : ""}
        <div class="my-1 border-t border-[#2a2d3e]"></div>
        ${row("EMA", money(c.ema))}
        ${row("CMO", c.cmo != null ? c.cmo.toFixed(1) : "—")}
        ${row("Entry", money(c.entryPrice), "text-green-400")}
      `;
      tooltip.style.display = "block";

      const container = containerRef.current;
      const containerWidth = container?.clientWidth ?? 0;
      const containerHeight = container?.clientHeight ?? 0;
      const tooltipWidth = tooltip.offsetWidth || 180;
      const tooltipHeight = tooltip.offsetHeight || 160;
      const margin = 12;

      let left = param.point.x + margin;
      if (left + tooltipWidth > containerWidth) left = param.point.x - tooltipWidth - margin;

      let top = param.point.y - 10;
      if (top + tooltipHeight > containerHeight) top = containerHeight - tooltipHeight - margin;

      tooltip.style.left = `${Math.max(0, left)}px`;
      tooltip.style.top = `${Math.max(0, top)}px`;
    });

    // Surface the "jump to latest" button once the right edge of the visible
    // range has scrolled past the last real bar (a manual zoom/pan away from
    // the newest data), rather than showing it unconditionally.
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range) return;
      const total = candlesByTimeRef.current.size;
      setScrolledAway(range.to < total - 2);
    });

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = {};
      candlesByTimeRef.current = new Map();
    };
  }, []);

  // Update watermark + volume margin when options change
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      watermark: {
        visible: true,
        fontSize: 18,
        horzAlign: "left",
        vertAlign: "top",
        color: "rgba(255,255,255,0.04)",
        text: `${pair}  ${timeframe.toUpperCase()}`,
      },
      rightPriceScale: {
        borderColor: "#2a2d3e",
        scaleMargins: { top: 0.1, bottom: showVolume ? 0.25 : 0.1 },
      },
    });
  }, [pair, timeframe, showVolume]);

  // Push new candle data without recreating the chart
  useEffect(() => {
    const {
      candleSeries,
      markers,
      emaFastSeries,
      emaSlowSeries,
      volumeSeries,
      chandeSeries,
    } = seriesRef.current;
    if (!candleSeries) return;

    if (!candles.length) {
      candleSeries.setData([]);
      markers.setMarkers([]);
      emaFastSeries.setData([]);
      emaSlowSeries.setData([]);
      volumeSeries.setData([]);
      chandeSeries.setData([]);
      candlesByTimeRef.current = new Map();
      lastClosedRef.current = null;
      formingCandleRef.current = null;
      return;
    }

    candleSeries.setData(
      candles.map((c) => ({ time: Math.floor(c.time / 1000), open: c.open, high: c.high, low: c.low, close: c.close }))
    );

    // Track the last CLOSED candle so live ticks (below) know what price to
    // open the next, still-forming candle from, and reset any in-progress
    // forming candle since fresh data supersedes it.
    lastClosedRef.current = candles[candles.length - 1];
    formingCandleRef.current = null;

    // Indexed by chart time so the crosshair-move handler can look up a
    // candle's signal/entry/indicator data for the hover tooltip.
    const byTime = new Map();
    for (const c of candles) {
      byTime.set(Math.floor(c.time / 1000), c);
    }
    candlesByTimeRef.current = byTime;

    const m = [];
    for (const c of candles) {
      if (showBuySignals && c.signal === 1) {
        m.push({ time: Math.floor(c.time / 1000), position: "belowBar", color: "#2ecc71", shape: "arrowUp", text: "BUY" });
      }
    }
    markers.setMarkers(m);

    emaFastSeries.applyOptions({ visible: showEmaFast });
    emaFastSeries.setData(
      candles
        .filter((c) => (c.ema ?? c.emaFast) != null)
        .map((c) => ({ time: Math.floor(c.time / 1000), value: Math.round((c.ema ?? c.emaFast) * 1e4) / 1e4 }))
    );

    emaSlowSeries.applyOptions({ visible: showEmaSlow });
    emaSlowSeries.setData(
      candles.filter((c) => c.emaSlow != null).map((c) => ({ time: Math.floor(c.time / 1000), value: Math.round(c.emaSlow * 1e4) / 1e4 }))
    );

    volumeSeries.applyOptions({ visible: showVolume });
    volumeSeries.setData(
      candles.map((c) => ({
        time: Math.floor(c.time / 1000),
        value: c.volume,
        color: c.close >= c.open ? "rgba(38,166,154,0.5)" : "rgba(239,83,80,0.5)",
      }))
    );

    const line = (key) =>
      candles.filter((c) => c[key] != null).map((c) => ({ time: Math.floor(c.time / 1000), value: c[key] }));

    chandeSeries.applyOptions({ visible: showChande });

    if (showChande) {
      chandeSeries.setData(line("cmo"));
    }

    // A manual zoom/pan on the price axis disables its autoScale; force it
    // back on whenever fresh data lands (e.g. switching pairs) so the chart
    // doesn't stay frozen on a stale price range.
    // fitContent() triggers the visible-range subscription above, which
    // clears `scrolledAway` once the range change lands.
    candleSeries.priceScale().applyOptions({ autoScale: true });
    chartRef.current?.timeScale().fitContent();
  }, [candles, showEmaFast, showEmaSlow, showBuySignals, showVolume, showChande]);

  // Draws/updates the currently-forming candle from live ticker prices, the
  // way TradingView keeps the rightmost bar live instead of only showing
  // closed bars. Uses candleSeries.update() (an incremental patch) rather
  // than setData() so it doesn't redraw the whole series on every tick.
  useEffect(() => {
    const { candleSeries } = seriesRef.current;
    const lastClosed = lastClosedRef.current;
    if (!candleSeries || !lastClosed || livePrice == null) return;

    const barTimeMs = lastClosed.time + HOUR_MS;

    // Once real time has moved past this bar's own close, it's stale — a
    // parent refetch is expected to bring it in as real closed data and reset
    // lastClosedRef. Stop patching it here to avoid drawing the wrong hour.
    if (now != null && now >= barTimeMs + HOUR_MS) return;

    const barTimeSec = Math.floor(barTimeMs / 1000);

    const prior = formingCandleRef.current;
    const bar =
      prior && prior.time === barTimeSec
        ? {
            time: barTimeSec,
            open: prior.open,
            high: Math.max(prior.high, livePrice),
            low: Math.min(prior.low, livePrice),
            close: livePrice,
          }
        : {
            // New bar period started: open it at the last closed candle's
            // close, same as the exchange would.
            time: barTimeSec,
            open: lastClosed.close,
            high: Math.max(lastClosed.close, livePrice),
            low: Math.min(lastClosed.close, livePrice),
            close: livePrice,
          };

    formingCandleRef.current = bar;
    candleSeries.update(bar);
  }, [livePrice, now]);

  function jumpToLatest() {
    chartRef.current?.timeScale().fitContent();
  }

  return (
    <div className="relative w-full">
      <div ref={containerRef} className="w-full" />
      <div
        ref={tooltipRef}
        className="absolute hidden pointer-events-none z-10 rounded border border-[#2a2d3e] bg-[#1e222d]/95 px-2.5 py-2 text-xs text-zinc-200 shadow-lg whitespace-nowrap"
        style={{ display: "none" }}
      />
      {scrolledAway && (
        <button
          type="button"
          onClick={jumpToLatest}
          title="Jump to the latest candles"
          className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 rounded border border-[#2a2d3e] bg-[#1e222d]/95 px-3 py-1.5 text-xs font-medium text-zinc-200 shadow-lg hover:bg-[#262b3a] hover:border-zinc-600"
        >
          Jump to latest ↦
        </button>
      )}
    </div>
  );
}
