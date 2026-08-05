import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  await redis.decr("stats:swap:trades");
  await redis.incrbyfloat("stats:swap:eth", -1.2345);
  await redis.decr(`stats:swap:trades:${day}`);
  await redis.incrbyfloat(`stats:swap:eth:${day}`, -1.2345);
  await redis.zincrby("swap:plans", -1, "relay-only");
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
