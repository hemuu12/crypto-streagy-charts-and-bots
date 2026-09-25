"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, LineSeries, HistogramSeries, createSeriesMarkers } from "lightweight-charts";

function money(value) {
  return value == null ? "—" : `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

const HOUR_MS = 60 * 60 * 1000;

export default function Chart({ candles, showEmaFast, showEmaSlow, showBuySignals, showVolume, showChande = false, cmoLength = 4, pair, timeframe, livePrice, now }) {
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

  // Long Position drawings (TradingView-style): each is an
  // { id, startTime, endTime, entry, stopLoss, takeProfit, qty } saved per
  // pair — startTime/endTime are chart-time seconds marking the box's left
  // and right edges. Rendered entirely as HTML overlay (shaded zones, an
  // entry line, and six corner/edge handles) since lightweight-charts price
  // lines can't be bounded to a time range or shaded.
  const [drawings, setDrawings] = useState([]);
  const drawingsRef = useRef(drawings); // mirrors `drawings` so mouseup can persist without a stale closure
  const [placing, setPlacing] = useState(false);
  // While dragging: { id, row: 'target'|'entry'|'stopLoss', col: 'left'|'right'|'move' }.
  // row picks which price the drag edits; col picks which time edge (or,
  // for 'move', both — dragging the body translates the whole box).
  const dragRef = useRef(null);
  const dragStartRef = useRef(null); // { mouseX, mouseY, drawing } snapshot taken on mousedown, for 'move'
  // Bumped whenever the overlay needs to re-read pixel positions from the
  // chart (pan/zoom/resize, or a drawing changing) — a plain counter instead
  // of storing the computed positions themselves, so there's no state <->
  // effect feedback loop between "positions changed" and "recompute positions".
  const [, bumpOverlayTick] = useState(0);

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
      title: `ChandeMO ${cmoLength} (1H)`,
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

  function drawingsKey(p) {
    return `longPositions:${p}`;
  }

  function readDrawings(p) {
    try {
      const raw = localStorage.getItem(drawingsKey(p));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  // Long Position drawings live in localStorage, keyed per pair — per
  // browser rather than shared across devices, but needs no backend.
  useEffect(() => {
    setDrawings(readDrawings(pair));
  }, [pair]);

  function persistAll(next) {
    try {
      localStorage.setItem(drawingsKey(pair), JSON.stringify(next));
    } catch {
      // Storage can throw in a private window or when quota is exceeded —
      // the drawing still works for this session, it just won't survive reload.
    }
  }

  function deleteDrawingById(id) {
    setDrawings((prev) => {
      const next = prev.filter((d) => d.id !== id);
      persistAll(next);
      return next;
    });
  }

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

    chandeSeries.applyOptions({ visible: showChande, title: `ChandeMO ${cmoLength} (1H)` });

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
  }, [candles, showEmaFast, showEmaSlow, showBuySignals, showVolume, showChande, cmoLength]);

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

  // Computes one drawing's on-screen pixel rect from its prices/times.
  // Called from render (via `overlayGeometryFor`, below) rather than stored
  // in state — the chart's own pan/zoom isn't React state, so there's no
  // single dependency array that would ever be "complete" for a memo; a
  // plain tick counter (bumped by the subscriptions below) just forces a
  // re-render, and this recomputes fresh each time from the live chart refs.
  function overlayGeometryFor(d) {
    const { candleSeries } = seriesRef.current;
    const chart = chartRef.current;
    if (!candleSeries || !chart || !candlesByTimeRef.current.size) return null;
    try {
      const timeScale = chart.timeScale();
      return {
        left: timeScale.timeToCoordinate(d.startTime),
        right: timeScale.timeToCoordinate(d.endTime),
        targetY: candleSeries.priceToCoordinate(d.takeProfit),
        entryY: candleSeries.priceToCoordinate(d.entry),
        stopY: candleSeries.priceToCoordinate(d.stopLoss),
      };
    } catch {
      // Can throw (not just return null) before the chart has finished
      // laying out a price/time scale, e.g. right after a pair switch.
      return null;
    }
  }

  useEffect(() => {
    drawingsRef.current = drawings;
  }, [drawings]);

  // Re-render the overlay on pan/zoom/resize/data changes — the underlying
  // prices/times haven't changed, only where they land on screen.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const bump = () => bumpOverlayTick((n) => n + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(bump);
    window.addEventListener("resize", bump);
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(bump);
      window.removeEventListener("resize", bump);
    };
  }, []);

  function priceAtY(y) {
    const { candleSeries } = seriesRef.current;
    return candleSeries?.coordinateToPrice(y) ?? null;
  }

  function timeAtX(x) {
    return chartRef.current?.timeScale().coordinateToTime(x) ?? null;
  }

  function persistDrawings(next) {
    setDrawings(next);
    persistAll(next);
  }

  // Freezes/unfreezes the chart's own pan+zoom so dragging a position box
  // moves only the box, not the viewport underneath it.
  function setChartInteractive(enabled) {
    chartRef.current?.applyOptions({
      handleScroll: enabled,
      handleScale: enabled,
    });
  }

  function handleContainerMouseDown(e) {
    if (e.target.closest("button")) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (placing) {
      const price = priceAtY(y);
      const startTime = timeAtX(x);
      if (price == null || startTime == null) return;
      const barSeconds = HOUR_MS / 1000;
      const entry = price;
      const stopLoss = entry * 0.99;
      const takeProfit = entry + (entry - stopLoss) * 2;
      const tmp = {
        id: `pos-${Date.now()}`,
        startTime,
        endTime: startTime + barSeconds * 40,
        entry,
        stopLoss,
        takeProfit,
        qty: 1,
      };
      persistDrawings([...drawings, tmp]);
      setPlacing(false);
      return;
    }

    // Hit-test the six handles (row x col) first, then the box body (for a
    // whole-box move), within a small tolerance so a precise click isn't
    // required.
    const HIT_PX = 8;
    for (const d of drawings) {
      const g = overlayGeometryFor(d);
      if (!g || g.left == null || g.right == null) continue;

      for (const [row, rowY] of [["target", g.targetY], ["entry", g.entryY], ["stopLoss", g.stopY]]) {
        if (rowY == null) continue;
        for (const [col, colX] of [["left", g.left], ["right", g.right]]) {
          if (Math.abs(colX - x) <= HIT_PX && Math.abs(rowY - y) <= HIT_PX) {
            dragRef.current = { id: d.id, row, col };
            setChartInteractive(false);
            return;
          }
        }
      }

      const withinX = x >= g.left - HIT_PX && x <= g.right + HIT_PX;
      const withinY = y >= Math.min(g.targetY, g.stopY) - HIT_PX && y <= Math.max(g.targetY, g.stopY) + HIT_PX;
      if (withinX && withinY) {
        dragRef.current = { id: d.id, row: "move", col: "move" };
        dragStartRef.current = { mouseX: x, mouseY: y, drawing: d };
        setChartInteractive(false);
        return;
      }
    }
  }

  function handleContainerMouseMove(e) {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (drag.row === "move") {
      const start = dragStartRef.current;
      if (!start) return;
      const dPrice = (priceAtY(y) ?? 0) - (priceAtY(start.mouseY) ?? 0);
      const dTime = (timeAtX(x) ?? 0) - (timeAtX(start.mouseX) ?? 0);
      setDrawings((prev) =>
        prev.map((d) =>
          d.id === drag.id
            ? {
                ...d,
                entry: start.drawing.entry + dPrice,
                stopLoss: start.drawing.stopLoss + dPrice,
                takeProfit: start.drawing.takeProfit + dPrice,
                startTime: start.drawing.startTime + dTime,
                endTime: start.drawing.endTime + dTime,
              }
            : d
        )
      );
      return;
    }

    const priceField = drag.row === "target" ? "takeProfit" : drag.row === "entry" ? "entry" : "stopLoss";
    const price = priceAtY(y);
    const time = timeAtX(x);

    setDrawings((prev) =>
      prev.map((d) => {
        if (d.id !== drag.id) return d;
        const next = { ...d };
        if (price != null) next[priceField] = price;
        if (time != null) {
          if (drag.col === "left") next.startTime = time;
          else if (drag.col === "right") next.endTime = time;
        }
        return next;
      })
    );
  }

  function handleContainerMouseUp() {
    if (dragRef.current) {
      persistAll(drawingsRef.current);
      setChartInteractive(true);
    }
    dragRef.current = null;
    dragStartRef.current = null;
  }

  function jumpToLatest() {
    chartRef.current?.timeScale().fitContent();
  }

  return (
    // Drag handlers live on the wrapper, not the chart container: the overlay
    // boxes render as siblings above the canvas, so a mousedown on a handle
    // would never reach a listener bound to the container itself.
    <div
      className="relative w-full"
      onMouseDown={handleContainerMouseDown}
      onMouseMove={handleContainerMouseMove}
      onMouseUp={handleContainerMouseUp}
      onMouseLeave={handleContainerMouseUp}
    >
      <button
        type="button"
        onClick={() => setPlacing((p) => !p)}
        title="Click, then click the chart to place a long position"
        className={`absolute top-2 left-2 z-20 rounded border px-2.5 py-1 text-xs font-medium shadow-lg ${
          placing
            ? "border-emerald-500 bg-emerald-900/60 text-emerald-300"
            : "border-[#2a2d3e] bg-[#1e222d]/95 text-zinc-200 hover:bg-[#262b3a] hover:border-zinc-600"
        }`}
      >
        ↗ Long Position{placing ? " · click chart" : ""}
      </button>
      <div ref={containerRef} className={`w-full ${placing ? "cursor-crosshair" : ""}`} />
      {drawings.map((d) => {
        const g = overlayGeometryFor(d);
        if (!g || g.left == null || g.right == null || g.entryY == null || g.stopY == null || g.targetY == null) {
          return null;
        }

        const left = Math.min(g.left, g.right);
        const width = Math.abs(g.right - g.left);
        const risk = Math.abs(d.entry - d.stopLoss);
        const reward = Math.abs(d.takeProfit - d.entry);
        const rr = risk > 0 ? (reward / risk).toFixed(2) : "—";
        const lossPct = d.entry ? (-risk / d.entry) * 100 : 0;
        const gainPct = d.entry ? (reward / d.entry) * 100 : 0;
        const qty = d.qty ?? 0;
        const markPrice = livePrice ?? d.entry;
        const openPnl = qty * (markPrice - d.entry);

        const handleBox = (x, y) => ({
          left: `${x - 4}px`,
          top: `${y - 4}px`,
          width: "8px",
          height: "8px",
          border: "2px solid #2962ff",
          background: "#131722",
          borderRadius: "2px",
          cursor: "nwse-resize",
        });

        return (
          <div key={d.id} className="absolute inset-0 z-10 pointer-events-none">
            {/* Target zone: entry -> target */}
            <div
              className="absolute pointer-events-auto"
              style={{
                left: `${left}px`,
                width: `${width}px`,
                top: `${Math.min(g.targetY, g.entryY)}px`,
                height: `${Math.abs(g.entryY - g.targetY)}px`,
                background: "rgba(38,166,154,0.20)",
                borderTop: "1px dashed #26a69a",
                cursor: "move",
              }}
            />
            {/* Stop zone: entry -> stop */}
            <div
              className="absolute pointer-events-auto"
              style={{
                left: `${left}px`,
                width: `${width}px`,
                top: `${Math.min(g.entryY, g.stopY)}px`,
                height: `${Math.abs(g.stopY - g.entryY)}px`,
                background: "rgba(239,83,80,0.20)",
                borderBottom: "1px dashed #ef5350",
                cursor: "move",
              }}
            />
            {/* Entry line */}
            <div
              className="absolute pointer-events-auto"
              style={{
                left: `${left}px`,
                width: `${width}px`,
                top: `${g.entryY}px`,
                height: "0px",
                borderTop: "2px solid #2962ff",
                cursor: "ns-resize",
              }}
            />

            {[
              [left, g.targetY],
              [left + width, g.targetY],
              [left, g.entryY],
              [left + width, g.entryY],
              [left, g.stopY],
              [left + width, g.stopY],
            ].map(([hx, hy], i) => (
              <div key={i} className="absolute pointer-events-auto" style={handleBox(hx, hy)} />
            ))}

            <div
              className="absolute pointer-events-auto rounded px-2 py-0.5 text-[11px] font-medium text-white whitespace-nowrap"
              style={{
                left: `${left + width / 2}px`,
                top: `${g.targetY - 8}px`,
                transform: "translate(-50%, -100%)",
                background: "#089981",
              }}
            >
              Target: {money(d.takeProfit)} ({gainPct.toFixed(2)}%), Amount: {qty}
            </div>

            <div
              className="absolute pointer-events-auto rounded px-2 py-0.5 text-[11px] font-semibold text-white text-center leading-tight"
              style={{
                left: `${left + width / 2}px`,
                top: `${g.entryY}px`,
                transform: "translate(-50%, -50%)",
                background: openPnl >= 0 ? "#089981" : "#f23645",
              }}
            >
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span>
                  Open PnL: {openPnl.toFixed(2)}, Qty: {qty}
                </span>
                <button
                  type="button"
                  onClick={() => deleteDrawingById(d.id)}
                  title="Delete this position"
                  className="text-white/70 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="whitespace-nowrap">Risk/reward ratio: {rr}</div>
            </div>

            <div
              className="absolute pointer-events-auto rounded px-2 py-0.5 text-[11px] font-medium text-white whitespace-nowrap"
              style={{
                left: `${left + width / 2}px`,
                top: `${g.stopY + 8}px`,
                transform: "translateX(-50%)",
                background: "#f23645",
              }}
            >
              Stop: {money(d.stopLoss)} ({lossPct.toFixed(2)}%), Amount: {qty}
            </div>
          </div>
        );
      })}
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
