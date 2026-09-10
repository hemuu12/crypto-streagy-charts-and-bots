import { WebSocketServer } from "ws";
import ccxt from "ccxt";

const POLL_MS = 5000;

function makeBinance() {
  return new ccxt.binance({ enableRateLimit: true, options: { defaultType: "spot" } });
}

// Polls REST tickers on an interval rather than using true exchange
// WebSockets — ccxt.pro (needed for watchTicker) is a paid add-on, so this
// gives clients push-style updates over our own WebSocket without it.
export function attachStream(server) {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const subscriptions = new Map(); // pair -> Set<ws>

  function broadcast(pair, payload) {
    const clients = subscriptions.get(pair);
    if (!clients) return;
    const message = JSON.stringify(payload);
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) ws.send(message);
    }
  }

  async function pollPair(pair) {
    try {
      const ticker = await makeBinance().fetchTicker(pair);
      broadcast(pair, { type: "ticker", pair, price: ticker.last, time: Date.now(), source: "binance" });
    } catch (e) {
      broadcast(pair, { type: "error", pair, message: e.message });
    }
  }

  const timers = new Map(); // pair -> intervalId

  function ensurePolling(pair) {
    if (timers.has(pair)) return;
    pollPair(pair);
    timers.set(pair, setInterval(() => pollPair(pair), POLL_MS));
  }

  function maybeStopPolling(pair) {
    const clients = subscriptions.get(pair);
    if (clients && clients.size > 0) return;
    const timer = timers.get(pair);
    if (timer) clearInterval(timer);
    timers.delete(pair);
    subscriptions.delete(pair);
  }

  wss.on("connection", (ws) => {
    ws.subscribedPairs = new Set();

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.type === "subscribe" && msg.pair) {
        if (!subscriptions.has(msg.pair)) subscriptions.set(msg.pair, new Set());
        subscriptions.get(msg.pair).add(ws);
        ws.subscribedPairs.add(msg.pair);
        ensurePolling(msg.pair);
      } else if (msg.type === "unsubscribe" && msg.pair) {
        subscriptions.get(msg.pair)?.delete(ws);
        ws.subscribedPairs.delete(msg.pair);
        maybeStopPolling(msg.pair);
      }
    });

    ws.on("close", () => {
      for (const pair of ws.subscribedPairs) {
        subscriptions.get(pair)?.delete(ws);
        maybeStopPolling(pair);
      }
    });
  });

  return wss;
}
