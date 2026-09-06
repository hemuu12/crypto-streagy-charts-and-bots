import { NextResponse } from "next/server";
import { runOnce } from "@/lib/bot.js";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const paper = body.paper !== false;

  try {
    const positions = await runOnce(paper);
    return NextResponse.json({ positions });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
