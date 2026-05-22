import pandas as pd
import config


def calculate_emas(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["ema_fast"] = df["close"].ewm(span=config.EMA_FAST, adjust=False).mean()
    df["ema_slow"] = df["close"].ewm(span=config.EMA_SLOW, adjust=False).mean()
    return df


def generate_signals(df: pd.DataFrame) -> pd.DataFrame:
    df = calculate_emas(df)

    # 1 = fast crosses above slow (golden cross = BUY)
    # -1 = fast crosses below slow (death cross = SELL)
    df["signal"] = 0
    df["prev_fast"] = df["ema_fast"].shift(1)
    df["prev_slow"] = df["ema_slow"].shift(1)

    golden_cross = (df["ema_fast"] > df["ema_slow"]) & (df["prev_fast"] <= df["prev_slow"])
    death_cross = (df["ema_fast"] < df["ema_slow"]) & (df["prev_fast"] >= df["prev_slow"])

    df.loc[golden_cross, "signal"] = 1
    df.loc[death_cross, "signal"] = -1

    df.drop(columns=["prev_fast", "prev_slow"], inplace=True)
    return df


def get_latest_signal(df: pd.DataFrame) -> dict:
    df = generate_signals(df)
    last = df.iloc[-1]
    prev = df.iloc[-2]

    return {
        "signal": int(last["signal"]),
        "close": float(last["close"]),
        "ema_fast": float(last["ema_fast"]),
        "ema_slow": float(last["ema_slow"]),
        "trend": "bullish" if last["ema_fast"] > last["ema_slow"] else "bearish",
        "prev_signal": int(prev["signal"]),
    }
