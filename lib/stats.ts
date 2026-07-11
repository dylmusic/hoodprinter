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
  ethAmount: number,
  token?: string,
  sym?: string
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

  // Increment the wallet's count first so we can mirror the exact total into
  // the wallets index (score = buy count) — self-correcting, no drift.
  const walletBuys = await redis.incr(`wallet:${w}:buys`);

  const writes: Promise<unknown>[] = [
    redis.incr("stats:buys"),
    redis.incrbyfloat("stats:eth", ethAmount),
    redis.incrbyfloat(`wallet:${w}:eth`, ethAmount),
    // Index of every wallet, ranked by buys — the basis for an airdrop CSV.
    redis.zadd("wallets:bybuys", { score: walletBuys, member: w }),
  ];

  // Per-token leaderboard: sorted sets make "top tokens" a one-shot read.
  if (token && /^0x[0-9a-fA-F]{40}$/.test(token)) {
    const t = token.toLowerCase();
    writes.push(
      redis.zincrby("tokens:buys", 1, t),
      redis.zincrby("tokens:eth", ethAmount, t)
    );
    if (sym) writes.push(redis.hset("tokens:sym", { [t]: sym }));
  }

  await Promise.all(writes);
  return { counted: true };
}

export type TopToken = { ca: string; sym: string | null; buys: number; eth: number };

/** Top tokens by ETH volume — for the (future) leaderboard UI. */
export async function readTopTokens(limit = 10): Promise<TopToken[]> {
  const redis = getRedis();
  if (!redis) return [];
  const n = Math.max(1, Math.min(50, limit));
  // Flat [member, score, member, score, …], highest volume first.
  const flat = (await redis.zrange("tokens:eth", 0, n - 1, {
    rev: true,
    withScores: true,
  })) as (string | number)[];
  const cas: string[] = [];
  const ethByCa: Record<string, number> = {};
  for (let i = 0; i < flat.length; i += 2) {
    const ca = String(flat[i]);
    cas.push(ca);
    ethByCa[ca] = num(flat[i + 1]);
  }
  if (!cas.length) return [];
  return Promise.all(
    cas.map(async (ca) => {
      const [buys, sym] = await Promise.all([
        redis.zscore("tokens:buys", ca),
        redis.hget<string>("tokens:sym", ca),
      ]);
      return { ca, sym: sym ?? null, buys: num(buys), eth: ethByCa[ca] };
    })
  );
}

// ---- wallet ranks / airdrop export ----

// Buy-count thresholds → rank name. Mirrors the UI's level ladder.
export const RANKS: { name: string; at: number }[] = [
  { name: "Bronze", at: 100 },
  { name: "Silver", at: 1000 },
  { name: "Gold", at: 10000 },
  { name: "Platinum", at: 100000 },
  { name: "Diamond", at: 1000000 },
];

export function tierFor(buys: number): string {
  let name = "Rookie";
  for (const r of RANKS) if (buys >= r.at) name = r.name;
  return name;
}

export type WalletRow = {
  address: string;
  buys: number;
  eth: number;
  tier: string;
};

/** Every wallet, ranked by buys (high→low), with volume + computed tier. */
export async function readAllWallets(): Promise<WalletRow[]> {
  const redis = getRedis();
  if (!redis) return [];
  const flat = (await redis.zrange("wallets:bybuys", 0, -1, {
    rev: true,
    withScores: true,
  })) as (string | number)[];
  const addrs: string[] = [];
  const buysBy: Record<string, number> = {};
  for (let i = 0; i < flat.length; i += 2) {
    const a = String(flat[i]);
    addrs.push(a);
    buysBy[a] = num(flat[i + 1]);
  }
  if (!addrs.length) return [];
  const eths = await redis.mget<(string | number | null)[]>(
    ...addrs.map((a) => `wallet:${a}:eth`)
  );
  return addrs.map((a, i) => ({
    address: a,
    buys: buysBy[a],
    eth: num(eths[i]),
    tier: tierFor(buysBy[a]),
  }));
}

/**
 * One-time: seed the wallets index from any pre-existing `wallet:*:buys` keys
 * (so wallets counted before the index existed still appear). Idempotent —
 * ZADD sets the score to the authoritative count. Returns how many it indexed.
 */
export async function backfillWallets(): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  let cursor = "0";
  let count = 0;
  do {
    const [next, keys] = (await redis.scan(cursor, {
      match: "wallet:*:buys",
      count: 200,
    })) as [string, string[]];
    cursor = String(next);
    for (const key of keys) {
      const addr = key.slice("wallet:".length, -":buys".length);
      const buys = num(await redis.get(key));
      if (buys > 0) {
        await redis.zadd("wallets:bybuys", { score: buys, member: addr });
        count++;
      }
    }
  } while (cursor !== "0");
  return count;
}
