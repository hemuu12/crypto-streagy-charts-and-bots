import { MongoClient } from "mongodb";

let client;
let db;

export async function connectDb() {
  if (db) return db;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  client = new MongoClient(uri);
  await client.connect();
  db = client.db();
  await db.collection("positions").createIndex({ symbol: 1 }, { unique: true });
  await db.collection("bot_log").createIndex({ createdAt: -1 });
  await db.collection("backtest_runs").createIndex({ runAt: -1 });
  // Unique on (symbol, candleTime) so claiming a signal for alerting is an
  // atomic insert: concurrent or restarted pollers race on the DB, not on
  // in-process state, and a duplicate insert simply fails.
  await db.collection("alerted_signals").createIndex({ symbol: 1, candleTime: 1 }, { unique: true });
  return db;
}

export function getDb() {
  if (!db) throw new Error("DB not connected yet — call connectDb() first");
  return db;
}
