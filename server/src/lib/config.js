export const PULLBACK_TIMEFRAME = "1h";
export const PULLBACK_EMA_LENGTH = 200;
export const PULLBACK_CMO_LENGTH = 18;
export const PULLBACK_CMO_ZONE_LOW = -100;
export const PULLBACK_CMO_ZONE_HIGH = -30;

// 0 = no cooldown; every qualifying candle can open a trade. Entries are
// still bounded because a new trade only opens once the previous one has hit
// its stop or target.
export const PULLBACK_COOLDOWN_BARS = 0;

// Stop distance as a fraction of entry price. This defines 1R: the target is
// RISK_REWARD_RATIO * this distance above entry.
export const STOP_LOSS_PCT = 0.02;
export const RISK_REWARD_RATIO = 2;

// Fraction of capital lost when a trade is stopped out. Position size is
// derived from this and the stop distance, so this is true risk.
export const RISK_PER_TRADE = 0.02;

export const BACKTEST_START = "2022-01-01";
export const INITIAL_CAPITAL = 10000;

export const PAIRS = ["BTC/USDT", "ETH/USDT", "BNB/USDT", "SOL/USDT", "AVAX/USDT", "XRP/USDT", "ADA/USDT"];
