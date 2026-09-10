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
  attachStream(server);

  const port = process.env.PORT || 4000;
  server.listen(port, () => {
    console.log(`crypto-bot-server listening on :${port} (REST /api, WebSocket /ws)`);
  });
}

main().catch((e) => {
  console.error("Failed to start server:", e);
  process.exit(1);
});
