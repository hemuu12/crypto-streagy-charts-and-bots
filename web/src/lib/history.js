import fs from "fs";
import path from "path";
import { sql, ensureSchema } from "./db.js";

const HISTORY_FILE = path.join(process.cwd(), "backtest-history.json");
const MAX_RUNS = 50;

function loadFromFile() {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveToFile(result) {
  const runs = loadFromFile();
  runs.unshift({ ...result, runAt: new Date().toISOString() });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(runs.slice(0, MAX_RUNS), null, 2));
}

export async function loadBacktestRuns() {
  if (!sql) return loadFromFile();

  await ensureSchema();
  const rows = await sql`
    SELECT run_at, symbol, start_date, end_date, result
    FROM backtest_runs
    ORDER BY run_at DESC
    LIMIT ${MAX_RUNS}
  `;
  return rows.map((row) => ({
    ...row.result,
    runAt: row.run_at,
  }));
}

export async function saveBacktestRun(result) {
  if (!sql) {
    saveToFile(result);
    return;
  }

  await ensureSchema();
  await sql`
    INSERT INTO backtest_runs (symbol, start_date, end_date, result)
    VALUES (${result.symbol}, ${result.start}, ${result.end}, ${JSON.stringify(result)})
  `;
}
