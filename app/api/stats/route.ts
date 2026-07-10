import { NextRequest, NextResponse } from "next/server";
import { getRedis, readStats } from "@/lib/stats";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  // Health check: prove the Redis binding actually works (round-trips a key).
  if (req.nextUrl.searchParams.get("health")) {
    const redis = getRedis();
    if (!redis) {
      return NextResponse.json(
        { ok: false, configured: false },
        { headers: { "cache-control": "no-store" } }
      );
    }
    try {
      await redis.set("health:ping", Date.now().toString(), { ex: 60 });
      const v = await redis.get("health:ping");
      return NextResponse.json(
        { ok: true, configured: true, roundtrip: v != null },
        { headers: { "cache-control": "no-store" } }
      );
    } catch (e) {
      return NextResponse.json(
        { ok: false, configured: true, error: String(e) },
        { headers: { "cache-control": "no-store" } }
      );
    }
  }

  const wallet = req.nextUrl.searchParams.get("wallet") || undefined;
  const w = wallet && /^0x[0-9a-fA-F]{40}$/.test(wallet) ? wallet : undefined;
  const stats = await readStats(w);

  // Platform totals are identical for everyone → let the CDN serve them so
  // many open tabs collapse into ~one Redis read per interval. Per-wallet
  // responses are private and never cached.
  const cache = w
    ? "private, no-store"
    : "public, s-maxage=15, stale-while-revalidate=60";
  return NextResponse.json(stats, { headers: { "cache-control": cache } });
}
