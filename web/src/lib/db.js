import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

export const sql = connectionString ? neon(connectionString) : null;

let initialized = false;

export async function ensureSchema() {
  if (!sql || initialized) return;
  await sql`
    CREATE TABLE IF NOT EXISTS positions (
      symbol TEXT PRIMARY KEY,
      entry DOUBLE PRECISION NOT NULL,
      qty DOUBLE PRECISION NOT NULL,
      stop_loss DOUBLE PRECISION NOT NULL,
      take_profit DOUBLE PRECISION NOT NULL,
      opened_at TIMESTAMPTZ NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS bot_log (
      id SERIAL PRIMARY KEY,
      logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      message TEXT NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS backtest_runs (
      id SERIAL PRIMARY KEY,
      run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      symbol TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      result JSONB NOT NULL
    )
  `;
  initialized = true;
}
