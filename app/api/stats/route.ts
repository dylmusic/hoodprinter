import { NextRequest, NextResponse } from "next/server";
import { readStats } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet") || undefined;
  const w =
    wallet && /^0x[0-9a-fA-F]{40}$/.test(wallet) ? wallet : undefined;
  const stats = await readStats(w);
  return NextResponse.json(stats, {
    headers: { "cache-control": "no-store" },
  });
}
