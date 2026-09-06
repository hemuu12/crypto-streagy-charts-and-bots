import ccxt
import pandas as pd
from datetime import datetime
import config


def get_public_exchange():
    """No API keys needed — for market data only."""
    return ccxt.bybit({
        "enableRateLimit": True,
        "options": {
            "defaultType": "spot",
        },
    })


def get_private_exchange():
    """API keys required — for orders and balance."""
    return ccxt.bybit({
        "apiKey": config.API_KEY,
        "secret": config.API_SECRET,
        "enableRateLimit": True,
        "options": {"defaultType": "spot"},
    })


def fetch_ohlcv(symbol: str, timeframe: str = config.TIMEFRAME, limit: int = 500) -> pd.DataFrame:
    exchange = get_public_exchange()
    raw = exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)
    df = pd.DataFrame(raw, columns=["timestamp", "open", "high", "low", "close", "volume"])
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
    df.set_index("timestamp", inplace=True)
    return df


def fetch_historical(symbol: str, start: str, end: str, timeframe: str = config.TIMEFRAME) -> pd.DataFrame:
    exchange = get_public_exchange()
    since = int(datetime.strptime(start, "%Y-%m-%d").timestamp() * 1000)
    end_ts = int(datetime.strptime(end, "%Y-%m-%d").timestamp() * 1000)

    all_candles = []
    while since < end_ts:
        candles = exchange.fetch_ohlcv(symbol, timeframe=timeframe, since=since, limit=1000)
        if not candles:
            break
        all_candles.extend(candles)
        since = candles[-1][0] + 1

    df = pd.DataFrame(all_candles, columns=["timestamp", "open", "high", "low", "close", "volume"])
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
    df.set_index("timestamp", inplace=True)
    df = df[df.index <= end]
    return df.drop_duplicates()


def get_balance(asset: str = "USDT") -> float:
    exchange = get_private_exchange()
    balance = exchange.fetch_balance()
    return balance["free"].get(asset, 0.0)


def get_ticker_price(symbol: str) -> float:
    exchange = get_public_exchange()
    ticker = exchange.fetch_ticker(symbol)
    return ticker["last"]


def get_exchange():
    return get_private_exchange()
