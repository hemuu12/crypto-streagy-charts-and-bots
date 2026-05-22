from dotenv import load_dotenv
import os

load_dotenv()

# Binance API credentials - set these in your .env file
API_KEY = os.getenv("BINANCE_API_KEY", "")
API_SECRET = os.getenv("BINANCE_API_SECRET", "")

# Trading pairs
PAIRS = ["BTC/USDT", "ETH/USDT", "BNB/USDT", "SOL/USDT"]

# Timeframe
TIMEFRAME = "4h"

# EMA settings
EMA_FAST = 50
EMA_SLOW = 200

# Risk management
RISK_PER_TRADE = 0.02       # 2% of portfolio per trade
STOP_LOSS_PCT = 0.02        # 2% stop loss
TAKE_PROFIT_PCT = 0.04      # 4% take profit (2:1 RR)
MAX_OPEN_POSITIONS = 4      # one per pair

# Backtest settings
BACKTEST_START = "2022-01-01"
BACKTEST_END = "2024-12-31"
INITIAL_CAPITAL = 10000     # USDT

# Bot loop interval in seconds (4h = 14400s, check every 5min for safety)
LOOP_INTERVAL = 300
