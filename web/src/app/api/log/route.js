import { NextResponse } from "next/server";
import { loadLogLines } from "@/lib/bot.js";

export async function GET() {
  const lines = await loadLogLines(60);
  return NextResponse.json({ lines });
}
