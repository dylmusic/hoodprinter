import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// READ-ONLY temp diagnostic route for the volume-backfill project. No
// mutation at all — safe to call any number of times. Deleted once the
// backfill is done.
export async function GET(req: NextRequest) {
  const secret = process.env.STATS_ADMIN_KEY;
  const key = req.nextUrl.searchParams.get("key");
  if (!secret || key !== secret) return NextResponse.json({ ok: false }, { status: 403 });
  const redis = getRedis();
  if (!redis) return NextResponse.json({ ok: false, error: "no redis" }, { status: 503 });

  const [traders, pairs, pairsEth, plans] = await Promise.all([
    redis.zrange("swap:traders", 0, -1, { withScores: true }) as Promise<(string | number)[]>,
    redis.zrange("swap:pairs", 0, -1, { rev: true, withScores: true }) as Promise<(string | number)[]>,
    redis.zrange("swap:pairs:eth", 0, -1, { rev: true, withScores: true }) as Promise<(string | number)[]>,
    redis.zrange("swap:plans", 0, -1, { rev: true, withScores: true }) as Promise<(string | number)[]>,
  ]);
  return NextResponse.json({ traders, pairs, pairsEth, plans });
}
