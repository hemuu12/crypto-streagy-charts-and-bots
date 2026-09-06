import { NextResponse } from "next/server";
import { loadBacktestRuns } from "@/lib/history.js";

export async function GET() {
  const runs = await loadBacktestRuns();
  return NextResponse.json({ runs });
}
