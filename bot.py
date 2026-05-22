import time
import json
import os
from datetime import datetime
import ccxt
import config
from data import fetch_ohlcv, get_balance, get_ticker_price, get_exchange
from strategy import get_latest_signal
from risk import position_size, stop_loss_price, take_profit_price, is_max_positions_reached, calc_pnl_pct

STATE_FILE = "positions.json"


def load_positions() -> dict:
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    return {}


def save_positions(positions: dict):
    with open(STATE_FILE, "w") as f:
        json.dump(positions, f, indent=2)


def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open("bot.log", "a") as f:
        f.write(line + "\n")


def place_buy(exchange, symbol: str, qty: float):
    order = exchange.create_market_buy_order(symbol, qty)
    return order


def place_sell(exchange, symbol: str, qty: float):
    order = exchange.create_market_sell_order(symbol, qty)
    return order


def run_once(paper: bool = True):
    positions = load_positions()
    exchange = get_exchange()

    for symbol in config.PAIRS:
        try:
            df = fetch_ohlcv(symbol)
            signal = get_latest_signal(df)
            price = signal["close"]

            log(f"{symbol} | trend={signal['trend']} | signal={signal['signal']} | price={price}")

            # BUY signal
            if signal["signal"] == 1 and symbol not in positions:
                if is_max_positions_reached(positions):
                    log(f"Max positions reached, skipping {symbol}")
                    continue

                balance = get_balance("USDT") if not paper else config.INITIAL_CAPITAL
                qty = position_size(balance, price)
                sl = stop_loss_price(price)
                tp = take_profit_price(price)

                if not paper:
                    place_buy(exchange, symbol, qty)

                positions[symbol] = {
                    "entry": price,
                    "qty": qty,
                    "stop_loss": sl,
                    "take_profit": tp,
                    "time": datetime.now().isoformat(),
                }
                save_positions(positions)
                log(f"BOUGHT {symbol} | qty={qty} | entry={price} | SL={sl} | TP={tp}")

            # SELL signal or SL/TP hit
            elif symbol in positions:
                pos = positions[symbol]
                entry = pos["entry"]
                qty = pos["qty"]
                sl = pos["stop_loss"]
                tp = pos["take_profit"]
                pnl_pct = calc_pnl_pct(entry, price)
                reason = None

                if signal["signal"] == -1:
                    reason = "death_cross"
                elif price <= sl:
                    reason = "stop_loss"
                elif price >= tp:
                    reason = "take_profit"

                if reason:
                    if not paper:
                        place_sell(exchange, symbol, qty)

                    log(f"SOLD {symbol} | reason={reason} | entry={entry} | exit={price} | pnl={pnl_pct}%")
                    del positions[symbol]
                    save_positions(positions)

        except Exception as e:
            log(f"ERROR on {symbol}: {e}")

    return positions


def run_live(paper: bool = True):
    log(f"Bot started | paper={paper} | pairs={config.PAIRS} | timeframe={config.TIMEFRAME}")
    while True:
        run_once(paper=paper)
        log(f"Sleeping {config.LOOP_INTERVAL}s...")
        time.sleep(config.LOOP_INTERVAL)


if __name__ == "__main__":
    run_live(paper=True)
