import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { connectDb } from "./lib/db.js";
import { attachStream } from "./ws/stream.js";
import apiRouter from "./routes/api.js";

async function main() {
  await connectDb();

  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
    : true;

  const app = express();
  app.use(cors({ origin: allowedOrigins }));
  app.use(express.json());
  app.use("/api", apiRouter);
  app.get("/health", (req, res) => res.json({ ok: true }));

  const server = createServer(app);
  const wss = attachStream(server);
  // ws re-emits the HTTP server's listen errors; without a listener here that
  // re-emit is an unhandled 'error' event and takes the process down before
  // the retry below can run.
  wss.on("error", () => {});

  const port = process.env.PORT || 4000;

  // On Windows a dev-reload kills the previous process without giving it a
  // chance to close its listener, so the port can take a moment to free up.
  // Retry briefly instead of dying with EADDRINUSE.
  let bindAttempts = 0;
  server.on("error", (e) => {
    if (e.code !== "EADDRINUSE" || bindAttempts >= 10) {
      console.error(e);
      process.exit(1);
    }
    bindAttempts++;
    console.log(`port ${port} busy, retrying (${bindAttempts}/10)...`);
    setTimeout(() => server.listen(port), 500);
  });

  server.listen(port, () => {
    console.log(`crypto-bot-server listening on :${port} (REST /api, WebSocket /ws)`);
  });

  // Release the port on shutdown. Without this a dev-reload can leave the old
  // process holding :PORT, and the replacement then fails with EADDRINUSE.
  let closing = false;
  function shutdown(signal) {
    if (closing) return;
    closing = true;
    console.log(`${signal} received — shutting down`);

    for (const client of wss.clients) client.terminate();
    wss.close();
    server.close(() => process.exit(0));

    // Don't wait forever on lingering keep-alive sockets.
    setTimeout(() => process.exit(0), 3000).unref();
  }

  for (const signal of ["SIGINT", "SIGTERM", "SIGUSR2"]) {
    process.on(signal, () => shutdown(signal));
  }
}

main().catch((e) => {
  console.error("Failed to start server:", e);
  process.exit(1);
});
