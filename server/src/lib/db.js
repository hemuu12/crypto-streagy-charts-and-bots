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
  return db;
}

export function getDb() {
  if (!db) throw new Error("DB not connected yet — call connectDb() first");
  return db;
}
