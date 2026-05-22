import streamlit as st
import pandas as pd
import json
import os

from streamlit_lightweight_charts import renderLightweightCharts

from data import fetch_ohlcv, get_ticker_price
from strategy import generate_signals, get_latest_signal
from backtest import run_backtest
from bot import run_once, load_positions
import config

st.set_page_config(page_title="Crypto EMA Bot", layout="wide", page_icon="📈")

st.markdown("""
<style>
    .stApp { background-color: #131722; }
    .block-container { padding-top: 0.5rem; padding-bottom: 0rem; }
    div[data-testid="metric-container"] {
        background: #1e222d;
        border: 1px solid #2a2d3e;
        border-radius: 6px;
        padding: 8px 14px;
    }
    section[data-testid="stSidebar"] { background-color: #1e222d; }
    .stSelectbox label, .stSlider label, .stCheckbox label { color: #d1d4dc !important; }
</style>
""", unsafe_allow_html=True)

# ── Header ────────────────────────────────────────────────────────────────────
st.markdown("## 📈 EMA 50/200 Crypto Bot")

# ── Sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown("### Controls")
    selected_pair = st.selectbox("Pair", config.PAIRS)

    timeframe_map = {"1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d"}
    selected_tf = st.selectbox("Timeframe", list(timeframe_map.keys()), index=4)

    candle_limit = st.slider("Candles", min_value=50, max_value=500, value=250, step=50)

    st.divider()
    show_ema_fast = st.checkbox(f"EMA {config.EMA_FAST}", value=True)
    show_ema_slow = st.checkbox(f"EMA {config.EMA_SLOW}", value=True)
    show_signals  = st.checkbox("Buy/Sell Signals", value=True)
    show_volume   = st.checkbox("Volume", value=True)

    st.divider()
    paper_mode      = st.toggle("Paper Trading", value=True)
    run_bot_btn     = st.button("▶ Run Bot Once", type="primary", use_container_width=True)
    run_backtest_btn= st.button("📊 Run Backtest", use_container_width=True)

    st.divider()
    st.caption(f"EMA {config.EMA_FAST}/{config.EMA_SLOW}  •  SL {config.STOP_LOSS_PCT*100}%  •  TP {config.TAKE_PROFIT_PCT*100}%")

if run_bot_btn:
    with st.spinner("Running bot cycle..."):
        run_once(paper=paper_mode)
    st.toast("Bot cycle complete!", icon="✅")

# ── Fetch & Process Data ──────────────────────────────────────────────────────
with st.spinner(f"Loading {selected_pair} {selected_tf}..."):
    df = fetch_ohlcv(selected_pair, timeframe=selected_tf, limit=candle_limit)
    df = generate_signals(df)
    signal_info = get_latest_signal(df)

# ── Metrics Row ───────────────────────────────────────────────────────────────
price_change_pct = (signal_info["close"] - df["close"].iloc[-2]) / df["close"].iloc[-2] * 100

c1, c2, c3, c4, c5, c6 = st.columns(6)
c1.metric("Price",    f"${signal_info['close']:,.2f}", f"{price_change_pct:+.2f}%")
c2.metric(f"EMA {config.EMA_FAST}", f"${signal_info['ema_fast']:,.2f}")
c3.metric(f"EMA {config.EMA_SLOW}", f"${signal_info['ema_slow']:,.2f}")
c4.metric("Trend",    "🟢 BULLISH" if signal_info["trend"] == "bullish" else "🔴 BEARISH")
c5.metric("High",     f"${df['high'].iloc[-1]:,.2f}")
c6.metric("Low",      f"${df['low'].iloc[-1]:,.2f}")

# ── Prepare Chart Data ────────────────────────────────────────────────────────
def ts(idx):
    return int(idx.timestamp())

candle_data = [
    {"time": ts(i), "open": float(r.open), "high": float(r.high),
     "low": float(r.low), "close": float(r.close)}
    for i, r in df.iterrows()
]

volume_data = [
    {"time": ts(i), "value": float(r.volume),
     "color": "rgba(38,166,154,0.5)" if r.close >= r.open else "rgba(239,83,80,0.5)"}
    for i, r in df.iterrows()
]

ema_fast_data = [
    {"time": ts(i), "value": round(float(r.ema_fast), 4)}
    for i, r in df.iterrows() if not pd.isna(r.ema_fast)
]

ema_slow_data = [
    {"time": ts(i), "value": round(float(r.ema_slow), 4)}
    for i, r in df.iterrows() if not pd.isna(r.ema_slow)
]

# Buy/Sell markers
markers = []
if show_signals:
    for i, r in df.iterrows():
        if r.signal == 1:
            markers.append({
                "time": ts(i), "position": "belowBar",
                "color": "#2ecc71", "shape": "arrowUp", "text": "BUY",
                "size": 1,
            })
        elif r.signal == -1:
            markers.append({
                "time": ts(i), "position": "aboveBar",
                "color": "#e74c3c", "shape": "arrowDown", "text": "SELL",
                "size": 1,
            })

# ── Chart Config ──────────────────────────────────────────────────────────────
chart_options = {
    "height": 520,
    "layout": {
        "background": {"type": "solid", "color": "#131722"},
        "textColor": "#d1d4dc",
        "fontSize": 12,
        "fontFamily": "Inter, Trebuchet MS, sans-serif",
    },
    "grid": {
        "vertLines": {"color": "#1e2130", "style": 1},
        "horzLines": {"color": "#1e2130", "style": 1},
    },
    "crosshair": {
        "mode": 1,
        "vertLine": {"color": "#758696", "width": 1, "style": 3, "labelBackgroundColor": "#2a2d3e"},
        "horzLine": {"color": "#758696", "width": 1, "style": 3, "labelBackgroundColor": "#2a2d3e"},
    },
    "rightPriceScale": {
        "borderColor": "#2a2d3e",
        "textColor": "#d1d4dc",
        "scaleMargins": {"top": 0.1, "bottom": 0.25 if show_volume else 0.1},
    },
    "timeScale": {
        "borderColor": "#2a2d3e",
        "timeVisible": True,
        "secondsVisible": False,
        "barSpacing": 6,
        "rightOffset": 5,
        "fixLeftEdge": False,
        "fixRightEdge": False,
    },
    "handleScroll": {
        "mouseWheel": True,
        "pressedMouseMove": True,
        "horzTouchDrag": True,
        "vertTouchDrag": False,
    },
    "handleScale": {
        "axisPressedMouseMove": True,
        "mouseWheel": True,
        "pinch": True,
    },
    "watermark": {
        "visible": True,
        "fontSize": 18,
        "horzAlign": "left",
        "vertAlign": "top",
        "color": "rgba(255,255,255,0.04)",
        "text": f"{selected_pair}  {selected_tf.upper()}",
    },
}

# Build series list
series = [
    {
        "type": "Candlestick",
        "data": candle_data,
        "markers": markers,
        "options": {
            "upColor":       "#26a69a",
            "downColor":     "#ef5350",
            "borderVisible": False,
            "wickUpColor":   "#26a69a",
            "wickDownColor": "#ef5350",
        },
    },
]

if show_ema_fast:
    series.append({
        "type": "Line",
        "data": ema_fast_data,
        "options": {
            "color": "#f39c12",
            "lineWidth": 2,
            "priceLineVisible": False,
            "lastValueVisible": True,
            "crosshairMarkerVisible": True,
            "title": f"EMA {config.EMA_FAST}",
        },
    })

if show_ema_slow:
    series.append({
        "type": "Line",
        "data": ema_slow_data,
        "options": {
            "color": "#3498db",
            "lineWidth": 2,
            "priceLineVisible": False,
            "lastValueVisible": True,
            "crosshairMarkerVisible": True,
            "title": f"EMA {config.EMA_SLOW}",
        },
    })

if show_volume:
    series.append({
        "type": "Histogram",
        "data": volume_data,
        "options": {
            "priceFormat": {"type": "volume"},
            "priceScaleId": "volume",
            "scaleMargins": {"top": 0.8, "bottom": 0},
        },
    })

# ── Render TradingView Lightweight Chart ──────────────────────────────────────
renderLightweightCharts(
    [{"chart": chart_options, "series": series}],
    key=f"tv_chart_{selected_pair}_{selected_tf}_{candle_limit}",
)

st.caption("🖱 Scroll to zoom  •  Click & drag to pan  •  Double-click to reset")

# ── Open Positions ────────────────────────────────────────────────────────────
st.markdown("### Open Positions")
positions = load_positions()

if positions:
    rows_data = []
    for sym, pos in positions.items():
        try:
            current = get_ticker_price(sym)
        except Exception:
            current = pos["entry"]
        pnl_pct = round((current - pos["entry"]) / pos["entry"] * 100, 2)
        rows_data.append({
            "Pair": sym,
            "Entry $": pos["entry"],
            "Current $": current,
            "Qty": pos["qty"],
            "Stop Loss $": pos["stop_loss"],
            "Take Profit $": pos["take_profit"],
            "PnL %": pnl_pct,
            "Opened": pos["time"],
        })
    st.dataframe(pd.DataFrame(rows_data), use_container_width=True, hide_index=True)
else:
    st.info("No open positions.")

# ── Backtest ──────────────────────────────────────────────────────────────────
st.markdown("### Backtest Results")

if run_backtest_btn:
    with st.spinner(f"Backtesting {selected_pair} {config.BACKTEST_START} → {config.BACKTEST_END}..."):
        result = run_backtest(selected_pair)

    c1, c2, c3, c4, c5, c6 = st.columns(6)
    c1.metric("Initial",       f"${result['initial_capital']:,}")
    c2.metric("Final",         f"${result['final_capital']:,}")
    c3.metric("Return",        f"{result['return_pct']}%", delta=f"{result['return_pct']}%")
    c4.metric("Win Rate",      f"{result['win_rate']}%")
    c5.metric("Total Trades",  result["total_trades"])
    c6.metric("W / L",         f"{result['wins']} / {result['losses']}")

    sell_trades = [t for t in result["trades"] if t["type"] == "SELL"]
    if sell_trades:
        tdf = pd.DataFrame(sell_trades)
        tdf["pnl"] = tdf["pnl"].round(2)
        st.dataframe(tdf[["date", "price", "qty", "pnl", "reason"]],
                     use_container_width=True, hide_index=True)

# ── Bot Log ───────────────────────────────────────────────────────────────────
st.markdown("### Bot Log")
if os.path.exists("bot.log"):
    with open("bot.log") as f:
        lines = f.readlines()
    st.code("".join(lines[-60:]), language="text")
else:
    st.info("No log yet. Run the bot to see activity.")

st.caption("EMA 50/200 Strategy  •  Binance  •  TradingView Lightweight Charts")
