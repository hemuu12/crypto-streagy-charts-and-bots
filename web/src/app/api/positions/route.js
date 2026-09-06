import { NextResponse } from "next/server";
import { loadPositions } from "@/lib/bot.js";
import { getTickerPrice } from "@/lib/data.js";

export async function GET() {
  const positions = await loadPositions();
  const rows = [];

  for (const [symbol, pos] of Object.entries(positions)) {
    let current = pos.entry;
    try {
      current = await getTickerPrice(symbol);
    } catch {}
    const pnlPct = Math.round(((current - pos.entry) / pos.entry) * 100 * 100) / 100;
    rows.push({ symbol, ...pos, current, pnlPct });
  }

  return NextResponse.json({ positions: rows });
}
