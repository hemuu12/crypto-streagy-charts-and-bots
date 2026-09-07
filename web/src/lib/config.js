export const API_KEY = process.env.BINANCE_API_KEY || "";
export const API_SECRET = process.env.BINANCE_API_SECRET || "";
export const API_PASSWORD = process.env.OKX_API_PASSWORD || "";

export const PAIRS = ["BTC/USDT", "ETH/USDT", "BNB/USDT", "SOL/USDT"];

export const TIMEFRAME = "4h";

export const EMA_FAST = 50;
export const EMA_SLOW = 200;

// RSI + ChandeMO long-only strategy. RSI reads the 4H series, ChandeMO the 1H.
export const RSI_TIMEFRAME = "4h";
export const CHANDE_TIMEFRAME = "1h";
export const RSI_LENGTH = 14;
export const RSI_SMA_LENGTH = 14;
export const RSI_OVERBOUGHT = 80;
export const CHANDE_LENGTH = 4;
export const CHANDE_ZONE_LOW = -100;
export const CHANDE_ZONE_HIGH = -50;

// CMO-EMA Bullish Pullback: EMA 50/200 and CMO both read the 1H series.
// Entry needs EMA 50 > EMA 200, plus CMO currently sitting in the -100..-80
// zone and rising versus the previous candle.
export const PULLBACK_TIMEFRAME = "1h";
export const PULLBACK_EMA_FAST = 50;
export const PULLBACK_EMA_SLOW = 200;
export const PULLBACK_CMO_LENGTH = 4;
export const PULLBACK_CMO_ZONE_LOW = -100;
export const PULLBACK_CMO_ZONE_HIGH = -80;

export const RISK_PER_TRADE = 0.02;
export const STOP_LOSS_PCT = 0.02;
export const TAKE_PROFIT_PCT = 0.04;
export const MAX_OPEN_POSITIONS = 4;

export const BACKTEST_START = "2022-01-01";
export const BACKTEST_END = "2024-12-31";
export const INITIAL_CAPITAL = 10000;

export const LOOP_INTERVAL = 300;
