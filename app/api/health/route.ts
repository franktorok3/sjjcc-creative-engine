import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "sjjcc-creative-engine",
    creativePoc: true,
    timestamp: new Date().toISOString(),
  });
}
