import config


def position_size(capital: float, price: float, risk_pct: float = config.RISK_PER_TRADE) -> float:
    risk_amount = capital * risk_pct
    qty = risk_amount / price
    return round(qty, 6)


def stop_loss_price(entry: float, pct: float = config.STOP_LOSS_PCT) -> float:
    return round(entry * (1 - pct), 4)


def take_profit_price(entry: float, pct: float = config.TAKE_PROFIT_PCT) -> float:
    return round(entry * (1 + pct), 4)


def is_max_positions_reached(open_positions: dict) -> bool:
    return len(open_positions) >= config.MAX_OPEN_POSITIONS


def calc_pnl(entry: float, current: float, qty: float) -> float:
    return round((current - entry) * qty, 4)


def calc_pnl_pct(entry: float, current: float) -> float:
    return round((current - entry) / entry * 100, 2)
