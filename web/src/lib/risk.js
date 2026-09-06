import { RISK_PER_TRADE, STOP_LOSS_PCT, TAKE_PROFIT_PCT, MAX_OPEN_POSITIONS } from "./config.js";

export function positionSize(capital, price, riskPct = RISK_PER_TRADE) {
  const riskAmount = capital * riskPct;
  return Math.round((riskAmount / price) * 1e6) / 1e6;
}

export function stopLossPrice(entry, pct = STOP_LOSS_PCT) {
  return Math.round(entry * (1 - pct) * 1e4) / 1e4;
}

export function takeProfitPrice(entry, pct = TAKE_PROFIT_PCT) {
  return Math.round(entry * (1 + pct) * 1e4) / 1e4;
}

export function isMaxPositionsReached(openPositions) {
  return Object.keys(openPositions).length >= MAX_OPEN_POSITIONS;
}

export function calcPnl(entry, current, qty) {
  return Math.round((current - entry) * qty * 1e4) / 1e4;
}

export function calcPnlPct(entry, current) {
  return Math.round(((current - entry) / entry) * 100 * 100) / 100;
}
