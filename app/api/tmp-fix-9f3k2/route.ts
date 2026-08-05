import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bump this on every edit — lets a caller confirm the NEW code is actually
// live (Vercel deploy propagation lag bit us once already: a POST landed
// on a stale deployment still running the old decrement logic, applying an
// extra unwanted decrement) before triggering the mutating POST again.
const ROUTE_VERSION = 3;

export async function GET() {
  return NextResponse.json({ version: ROUTE_VERSION });
}

// ONE-TIME correction route. Reverses a single test POST to /api/swap made
// while verifying the new swap:pairs:eth volume tracking (a manual
// {wallet: 0x00...dead, plan: relay-only, fromSym: TESTA, toSym: TESTB,
// ethValue: 1.2345} call) so it doesn't pollute real production stats.
// Deleted in the very next commit after use — not a permanent admin tool.
export async function POST(req: NextRequest) {
  const secret = process.env.STATS_ADMIN_KEY;
  const key = req.nextUrl.searchParams.get("key");
  if (!secret || key !== secret) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const redis = getRedis();
  if (!redis) return NextResponse.json({ ok: false, error: "no redis" }, { status: 503 });

  const day = new Date().toISOString().slice(0, 10);
  const wallet = "0x000000000000000000000000000000000000dead";
  const pair = "TESTA→TESTB";

  const before = {
    trades: await redis.get("stats:swap:trades"),
    eth: await redis.get("stats:swap:eth"),
    tradesToday: await redis.get(`stats:swap:trades:${day}`),
    ethToday: await redis.get(`stats:swap:eth:${day}`),
    newTradersToday: await redis.get(`stats:swap:new_traders:${day}`),
    plan: await redis.zscore("swap:plans", "relay-only"),
    pairCount: await redis.zscore("swap:pairs", pair),
    pairEth: await redis.zscore("swap:pairs:eth", pair),
    isTrader: await redis.zscore("swap:traders", wallet),
  };

  // A first call already ran and over-corrected: its own "before" snapshot
  // showed totals already back at the true pre-test baseline (trades=94,
  // eth=2.3414269908334244, relay-only=8), meaning the test POST's effect
  // on the plain incr/incrbyfloat counters had already reverted or never
  // landed -- yet that call unconditionally decremented anyway, pushing
  // real totals 1 trade / 1.2345 ETH / 1 relay-only BELOW the true
  // baseline. This second pass adds that back with SET (exact known-good
  // values, not further arithmetic) rather than another blind incr/decr.
  await redis.set("stats:swap:trades", 94);
  await redis.set("stats:swap:eth", 2.3414269908334244);
  await redis.set(`stats:swap:trades:${day}`, 3);
  await redis.set(`stats:swap:eth:${day}`, 1.8769315521447565);
  await redis.zadd("swap:plans", { score: 8, member: "relay-only" });
  await redis.zrem("swap:pairs", pair);
  await redis.zrem("swap:pairs:eth", pair);
  if (before.isTrader !== null) {
    await redis.zrem("swap:traders", wallet);
    await redis.decr(`stats:swap:new_traders:${day}`);
  }

  const after = {
    trades: await redis.get("stats:swap:trades"),
    eth: await redis.get("stats:swap:eth"),
    tradesToday: await redis.get(`stats:swap:trades:${day}`),
    ethToday: await redis.get(`stats:swap:eth:${day}`),
    newTradersToday: await redis.get(`stats:swap:new_traders:${day}`),
    plan: await redis.zscore("swap:plans", "relay-only"),
    pairCount: await redis.zscore("swap:pairs", pair),
    pairEth: await redis.zscore("swap:pairs:eth", pair),
    isTrader: await redis.zscore("swap:traders", wallet),
  };

  return NextResponse.json({ ok: true, before, after });
}
