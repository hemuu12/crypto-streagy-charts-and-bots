"use client";

import { useEffect, useRef } from "react";
import { createChart, CandlestickSeries, LineSeries, HistogramSeries, createSeriesMarkers } from "lightweight-charts";

export default function Chart({ candles, showEmaFast, showEmaSlow, showSignals, showVolume, showRsi = false, showChande = false, pair, timeframe }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef({});

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

    // RSI and ChandeMO live on their own overlay scales so they can share the
    // candle pane without being flattened by the price axis.
    const rsiSeries = chart.addSeries(LineSeries, {
      color: "#a78bfa",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      priceScaleId: "rsi",
      title: "RSI 14 (4H)",
    });
    rsiSeries.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.55 } });

    const rsiSmaSeries = chart.addSeries(LineSeries, {
      color: "#64748b",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      priceScaleId: "rsi",
      title: "RSI SMA",
    });

    const chandeSeries = chart.addSeries(LineSeries, {
      color: "#f39c12",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      priceScaleId: "chande",
      title: "ChandeMO 4 (1H)",
    });
    chandeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.6, bottom: 0.02 } });

    seriesRef.current = {
      candleSeries,
      markers,
      emaFastSeries,
      emaSlowSeries,
      volumeSeries,
      rsiSeries,
      rsiSmaSeries,
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
      rsiSeries,
      rsiSmaSeries,
      chandeSeries,
    } = seriesRef.current;
    if (!candleSeries || !candles.length) return;

    candleSeries.setData(
      candles.map((c) => ({ time: Math.floor(c.time / 1000), open: c.open, high: c.high, low: c.low, close: c.close }))
    );

    if (showSignals) {
      const m = [];
      for (const c of candles) {
        if (c.signal === 1) {
          m.push({ time: Math.floor(c.time / 1000), position: "belowBar", color: "#2ecc71", shape: "arrowUp", text: "BUY" });
        } else if (c.signal === -1) {
          m.push({ time: Math.floor(c.time / 1000), position: "aboveBar", color: "#e74c3c", shape: "arrowDown", text: "SELL" });
        }
      }
      markers.setMarkers(m);
    } else {
      markers.setMarkers([]);
    }

    emaFastSeries.applyOptions({ visible: showEmaFast });
    emaFastSeries.setData(
      candles.filter((c) => c.emaFast != null).map((c) => ({ time: Math.floor(c.time / 1000), value: Math.round(c.emaFast * 1e4) / 1e4 }))
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

    rsiSeries.applyOptions({ visible: showRsi });
    rsiSmaSeries.applyOptions({ visible: showRsi });
    chandeSeries.applyOptions({ visible: showChande });

    if (showRsi) {
      rsiSeries.setData(line("rsi"));
      rsiSmaSeries.setData(line("rsiSma"));
    }
    if (showChande) {
      chandeSeries.setData(line("chande"));
    }

    chartRef.current?.timeScale().fitContent();
  }, [candles, showEmaFast, showEmaSlow, showSignals, showVolume, showRsi, showChande]);

  return <div ref={containerRef} className="w-full" />;
}
