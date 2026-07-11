import { NextRequest, NextResponse } from "next/server";
import { getRedis, readStats, readTopTokens, readTopWallets } from "@/lib/stats";

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

  // Wallet leaderboard (shared → CDN-cached). Addresses are public on-chain
  // data; the client shortens them for display.
  const boardParam = req.nextUrl.searchParams.get("board");
  if (boardParam) {
    const board = await readTopWallets(parseInt(boardParam) || 10);
    return NextResponse.json(
      { board },
      {
        headers: {
          "cache-control": "public, s-maxage=15, stale-while-revalidate=60",
        },
      }
    );
  }

  // Leaderboard read (shared → CDN-cached).
  const topParam = req.nextUrl.searchParams.get("top");
  if (topParam) {
    const top = await readTopTokens(parseInt(topParam) || 10);
    return NextResponse.json(
      { top },
      {
        headers: {
          "cache-control": "public, s-maxage=30, stale-while-revalidate=120",
        },
      }
    );
  }

  const wallet = req.nextUrl.searchParams.get("wallet") || undefined;
  const w = wallet && /^0x[0-9a-fA-F]{40}$/.test(wallet) ? wallet : undefined;
  const stats = await readStats(w);

  // Platform totals are identical for everyone → let the CDN serve them so
  // many open tabs collapse into ~one Redis read per interval. A short
  // s-maxage keeps the ticker feeling live for passive viewers while still
  // collapsing all traffic into ~one Redis read every few seconds regardless
  // of how many tabs are open. Per-wallet responses are private, never cached.
  const cache = w
    ? "private, no-store"
    : "public, s-maxage=4, stale-while-revalidate=30";
  return NextResponse.json(stats, { headers: { "cache-control": cache } });
}
