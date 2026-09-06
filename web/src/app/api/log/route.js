import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const LOG_FILE = path.join(process.cwd(), "bot.log");

export async function GET() {
  if (!fs.existsSync(LOG_FILE)) {
    return NextResponse.json({ lines: [] });
  }
  const lines = fs.readFileSync(LOG_FILE, "utf-8").split("\n").filter(Boolean);
  return NextResponse.json({ lines: lines.slice(-60) });
}
