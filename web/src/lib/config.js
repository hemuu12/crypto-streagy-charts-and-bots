export const API_KEY = process.env.BINANCE_API_KEY || "";
export const API_SECRET = process.env.BINANCE_API_SECRET || "";

export const PAIRS = ["BTC/USDT", "ETH/USDT", "BNB/USDT", "SOL/USDT"];

export const TIMEFRAME = "4h";

export const EMA_FAST = 50;
export const EMA_SLOW = 200;

export const RISK_PER_TRADE = 0.02;
export const STOP_LOSS_PCT = 0.02;
export const TAKE_PROFIT_PCT = 0.04;
export const MAX_OPEN_POSITIONS = 4;

export const BACKTEST_START = "2022-01-01";
export const BACKTEST_END = "2024-12-31";
export const INITIAL_CAPITAL = 10000;

export const LOOP_INTERVAL = 300;
