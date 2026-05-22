import pandas as pd
import numpy as np
from data import fetch_historical
from strategy import generate_signals
import config


def run_backtest(symbol: str, start: str = config.BACKTEST_START, end: str = config.BACKTEST_END) -> dict:
    df = fetch_historical(symbol, start, end)
    df = generate_signals(df)

    capital = config.INITIAL_CAPITAL
    position = 0.0
    entry_price = 0.0
    trades = []

    for i, row in df.iterrows():
        price = row["close"]

        # Entry: golden cross + no open position
        if row["signal"] == 1 and position == 0:
            qty = (capital * config.RISK_PER_TRADE) / price
            position = qty
            entry_price = price
            stop_loss = price * (1 - config.STOP_LOSS_PCT)
            take_profit = price * (1 + config.TAKE_PROFIT_PCT)
            capital -= qty * price
            trades.append({
                "type": "BUY",
                "date": str(i),
                "price": price,
                "qty": qty,
                "stop_loss": stop_loss,
                "take_profit": take_profit,
            })

        # Exit: death cross OR stop loss OR take profit hit
        elif position > 0:
            stop_loss = entry_price * (1 - config.STOP_LOSS_PCT)
            take_profit = entry_price * (1 + config.TAKE_PROFIT_PCT)
            exit_reason = None

            if row["signal"] == -1:
                exit_reason = "death_cross"
            elif price <= stop_loss:
                exit_reason = "stop_loss"
                price = stop_loss
            elif price >= take_profit:
                exit_reason = "take_profit"
                price = take_profit

            if exit_reason:
                pnl = (price - entry_price) * position
                capital += position * price
                trades.append({
                    "type": "SELL",
                    "date": str(i),
                    "price": price,
                    "qty": position,
                    "pnl": pnl,
                    "reason": exit_reason,
                })
                position = 0.0
                entry_price = 0.0

    # Close any open position at end
    if position > 0:
        final_price = df.iloc[-1]["close"]
        pnl = (final_price - entry_price) * position
        capital += position * final_price
        trades.append({
            "type": "SELL",
            "date": str(df.index[-1]),
            "price": final_price,
            "qty": position,
            "pnl": pnl,
            "reason": "end_of_data",
        })

    sell_trades = [t for t in trades if t["type"] == "SELL"]
    wins = [t for t in sell_trades if t.get("pnl", 0) > 0]
    losses = [t for t in sell_trades if t.get("pnl", 0) <= 0]
    total_pnl = sum(t.get("pnl", 0) for t in sell_trades)

    return {
        "symbol": symbol,
        "start": start,
        "end": end,
        "initial_capital": config.INITIAL_CAPITAL,
        "final_capital": round(capital, 2),
        "total_pnl": round(total_pnl, 2),
        "return_pct": round((capital - config.INITIAL_CAPITAL) / config.INITIAL_CAPITAL * 100, 2),
        "total_trades": len(sell_trades),
        "wins": len(wins),
        "losses": len(losses),
        "win_rate": round(len(wins) / len(sell_trades) * 100, 2) if sell_trades else 0,
        "trades": trades,
        "df": df,
    }


def run_all_pairs() -> list:
    results = []
    for pair in config.PAIRS:
        print(f"Backtesting {pair}...")
        result = run_backtest(pair)
        results.append(result)
    return results
