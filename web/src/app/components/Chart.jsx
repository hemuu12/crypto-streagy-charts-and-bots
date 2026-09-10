"use client";

import { useEffect, useRef } from "react";
import { createChart, CandlestickSeries, LineSeries, HistogramSeries, createSeriesMarkers } from "lightweight-charts";

export default function Chart({ candles, showEmaFast, showEmaSlow, showBuySignals, showVolume, showChande = false, showEntryPriceLines = false, pair, timeframe }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef({});
  const entryPriceLinesRef = useRef([]);

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
      entryPriceLinesRef.current = [];
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
      for (const priceLine of entryPriceLinesRef.current) {
        candleSeries.removePriceLine(priceLine);
      }
      entryPriceLinesRef.current = [];
      return;
    }

    candleSeries.setData(
      candles.map((c) => ({ time: Math.floor(c.time / 1000), open: c.open, high: c.high, low: c.low, close: c.close }))
    );

    const m = [];
    for (const c of candles) {
      if (showBuySignals && c.signal === 1) {
        m.push({ time: Math.floor(c.time / 1000), position: "belowBar", color: "#2ecc71", shape: "arrowUp", text: "BUY" });
      }
    }
    markers.setMarkers(m);

    // Anchor each BUY to its exact entry price with a horizontal line, rather
    // than only marking which candle triggered it — the price level is what
    // matters for the entry, not the time axis position.
    for (const priceLine of entryPriceLinesRef.current) {
      candleSeries.removePriceLine(priceLine);
    }
    entryPriceLinesRef.current = [];

    if (showEntryPriceLines) {
      for (const c of candles) {
        if (c.signal === 1 && c.entryPrice != null) {
          entryPriceLinesRef.current.push(
            candleSeries.createPriceLine({
              price: c.entryPrice,
              color: "#2ecc71",
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: `BUY $${c.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
            })
          );
        }
      }
    }

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
    candleSeries.priceScale().applyOptions({ autoScale: true });
    chartRef.current?.timeScale().fitContent();
  }, [candles, showEmaFast, showEmaSlow, showBuySignals, showVolume, showChande, showEntryPriceLines]);

  return <div ref={containerRef} className="w-full" />;
}
