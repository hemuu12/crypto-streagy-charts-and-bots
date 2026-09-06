import { EMA_FAST, EMA_SLOW } from "./config.js";

function ema(values, span) {
  const k = 2 / (span + 1);
  const out = new Array(values.length);
  out[0] = values[0];
  for (let i = 1; i < values.length; i++) {
    out[i] = values[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

export function calculateEMAs(candles) {
  const closes = candles.map((c) => c.close);
  const emaFast = ema(closes, EMA_FAST);
  const emaSlow = ema(closes, EMA_SLOW);
  return candles.map((c, i) => ({ ...c, emaFast: emaFast[i], emaSlow: emaSlow[i] }));
}

export function generateSignals(candles) {
  const withEmas = calculateEMAs(candles);
  return withEmas.map((c, i) => {
    if (i === 0) return { ...c, signal: 0 };
    const prev = withEmas[i - 1];
    let signal = 0;
    const goldenCross = c.emaFast > c.emaSlow && prev.emaFast <= prev.emaSlow;
    const deathCross = c.emaFast < c.emaSlow && prev.emaFast >= prev.emaSlow;
    if (goldenCross) signal = 1;
    else if (deathCross) signal = -1;
    return { ...c, signal };
  });
}

export function getLatestSignal(candles) {
  const withSignals = generateSignals(candles);
  const last = withSignals[withSignals.length - 1];
  const prev = withSignals[withSignals.length - 2];
  return {
    signal: last.signal,
    close: last.close,
    emaFast: last.emaFast,
    emaSlow: last.emaSlow,
    trend: last.emaFast > last.emaSlow ? "bullish" : "bearish",
    prevSignal: prev ? prev.signal : 0,
  };
}
