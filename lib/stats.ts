import { Redis } from "@upstash/redis";

/**
 * Shared platform counters for the /print buy bot.
 * Backed by Upstash Redis (Vercel KV). Everything is an atomic INCR so
 * concurrent buys from many users can't race or lose counts.
 *
 * Keys:
 *   stats:buys            global tx count
 *   stats:eth            global ETH volume (float)
 *   wallet:<addr>:buys   per-wallet tx count
 *   wallet:<addr>:eth    per-wallet ETH volume (float)
 *   seen:<txHash>        dedupe flag so a buy is only ever counted once
 */

let client: Redis | null = null;

export function getRedis(): Redis | null {
  if (client) return client;
  // Support both the Upstash-native and the Vercel-KV env var names.
  const url =
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null; // not provisioned yet — routes no-op
  client = new Redis({ url, token });
  return client;
}

export type PlatformStats = {
  buys: number;
  eth: number;
  wallet?: { buys: number; eth: number };
};

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

export async function readStats(wallet?: string): Promise<PlatformStats> {
  const redis = getRedis();
  if (!redis) return { buys: 0, eth: 0 };
  const w = wallet?.toLowerCase();
  const keys = ["stats:buys", "stats:eth"];
  if (w) keys.push(`wallet:${w}:buys`, `wallet:${w}:eth`);
  const vals = await redis.mget<(string | number | null)[]>(...keys);
  const out: PlatformStats = { buys: num(vals[0]), eth: num(vals[1]) };
  if (w) out.wallet = { buys: num(vals[2]), eth: num(vals[3]) };
  return out;
}

/**
 * Count one confirmed buy. Returns false if it was a duplicate (already
 * counted) — the caller should treat that as a no-op, not an error.
 */
export async function recordBuy(
  wallet: string,
  txHash: string,
  ethAmount: number
): Promise<{ counted: boolean }> {
  const redis = getRedis();
  if (!redis) return { counted: false };
  const w = wallet.toLowerCase();
  // Atomic dedupe: only the first writer for this tx hash proceeds.
  const first = await redis.set(`seen:${txHash.toLowerCase()}`, "1", {
    nx: true,
    ex: 60 * 60 * 24 * 90, // 90d — long enough that nothing double-counts
  });
  if (first !== "OK") return { counted: false };

  await Promise.all([
    redis.incr("stats:buys"),
    redis.incrbyfloat("stats:eth", ethAmount),
    redis.incr(`wallet:${w}:buys`),
    redis.incrbyfloat(`wallet:${w}:eth`, ethAmount),
  ]);
  return { counted: true };
}
