import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ONE-TIME historical volume backfill for Swap Terminal. All writes are
// absolute (SET/ZADD), not relative incr/decr -- idempotent, safe to call
// more than once (learned the hard way earlier in this same project: a
// decrement-based fix landed on a stale deployment and double-applied).
// Deleted in the very next commit after use.
const ROUTE_VERSION = 1;

const PAIRS: Record<string, { count: number; eth: number }> = {
  "ETH→PRINT": { count: 66, eth: 0.48300186 },
  "PRINT→ETH": { count: 9, eth: 0.0603099 },
  "SOL→CASHCAT": { count: 5, eth: 0.776718 },
  "WETH→RBT": { count: 1, eth: 0.017714 },
  "WETH→CATSTR": { count: 1, eth: 0.006057 },
  "cbBTC→ETH": { count: 1, eth: 0.000914 },
  "SOL→FRONG": { count: 1, eth: 1.042484 },
  "WETH→USDG": { count: 1, eth: 0.001995 },
  "WETH→ETH": { count: 2, eth: 0.016751 },
  "USDG→ETH": { count: 1, eth: 0.00073 },
  "SOL→PRINT": { count: 5, eth: 0.03659105 },
  "WETH→PRINT": { count: 4, eth: 0.02927284 },
  "USDC→PRINT": { count: 1, eth: 0.00731821 },
};

const TOTAL_TRADES = Object.values(PAIRS).reduce((a, p) => a + p.count, 0);
const TOTAL_ETH = Object.values(PAIRS).reduce((a, p) => a + p.eth, 0);
const RELAY_ONLY_PLAN_SCORE = 13; // 8 previous + SOL→CASHCAT(+1) + WETH→USDG(+1) + WETH→ETH(+2) + USDG→ETH(+1)

export async function GET() {
  return NextResponse.json({ version: ROUTE_VERSION, totalTrades: TOTAL_TRADES, totalEth: TOTAL_ETH });
}

export async function POST(req: NextRequest) {
  const secret = process.env.STATS_ADMIN_KEY;
  const key = req.nextUrl.searchParams.get("key");
  if (!secret || key !== secret) return NextResponse.json({ ok: false }, { status: 403 });
  const redis = getRedis();
  if (!redis) return NextResponse.json({ ok: false, error: "no redis" }, { status: 503 });

  await redis.set("stats:swap:trades", TOTAL_TRADES);
  await redis.set("stats:swap:eth", TOTAL_ETH);
  await redis.zadd("swap:plans", { score: RELAY_ONLY_PLAN_SCORE, member: "relay-only" });

  for (const [pair, v] of Object.entries(PAIRS)) {
    await redis.zadd("swap:pairs", { score: v.count, member: pair });
    await redis.zadd("swap:pairs:eth", { score: v.eth, member: pair });
  }

  const after = {
    trades: await redis.get("stats:swap:trades"),
    eth: await redis.get("stats:swap:eth"),
    relayOnlyPlan: await redis.zscore("swap:plans", "relay-only"),
    pairs: await redis.zrange("swap:pairs", 0, -1, { rev: true, withScores: true }),
    pairsEth: await redis.zrange("swap:pairs:eth", 0, -1, { rev: true, withScores: true }),
  };

  return NextResponse.json({ ok: true, after });
}
