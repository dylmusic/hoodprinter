import { Redis } from "@upstash/redis";

/**
 * Shared platform counters for the /print buy bot.
 * Backed by Upstash Redis (Vercel KV). Everything is an atomic INCR so
 * concurrent buys from many users can't race or lose counts.
 *
 * Keys:
 *   stats:buys                 global tx count
 *   stats:eth                  global ETH volume (float)
 *   stats:buys:<YYYY-MM-DD>    daily buy count (time-series)
 *   stats:eth:<YYYY-MM-DD>     daily ETH volume (time-series)
 *   stats:visits:<YYYY-MM-DD>  daily /print landings (funnel top)
 *   wallet:<addr>:buys         per-wallet tx count
 *   wallet:<addr>:eth          per-wallet ETH volume (float)
 *   wallet:<addr>:first_buy    ms timestamp of the wallet's first buy (NX)
 *   wallets:created            zset, score = first-seen ms (creation funnel)
 *   seen:<txHash>              dedupe flag so a buy is only ever counted once
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
  gas?: number;
  wallet?: { buys: number; eth: number; gas: number };
};

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

/** Soft per-IP hourly throttle, scoped per feature (mirrors lib/airdrop). */
export async function ipThrottled(
  scope: string,
  ip: string,
  limit: number
): Promise<boolean> {
  const redis = getRedis();
  if (!redis || !ip) return false;
  const key = `ip:${scope}:${ip}`;
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, 60 * 60);
  return n > limit;
}

/**
 * Record that a bot wallet exists (created in-browser, or recovered from a
 * returning user's localStorage). NX keeps the first-seen timestamp, so
 * re-reports never move a wallet's place in the funnel — same FCFS pattern
 * as airdrop:order. Only ever receives the derived ADDRESS, never the key.
 */
export async function recordWalletCreated(addr: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.zadd("wallets:created", { nx: true }, {
    score: Date.now(),
    member: addr.toLowerCase(),
  });
}

/**
 * Count one tool-page landing into today's funnel bucket. No PII, no wallet.
 * /print keeps the legacy key (`stats:visits:<day>`) for continuity; other
 * pages get their own namespace (`stats:visits:ms:<day>` for multisend).
 */
export async function recordVisit(page: "print" | "multisend" = "print"): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const key =
    page === "multisend" ? `stats:visits:ms:${dayKey()}` : `stats:visits:${dayKey()}`;
  await redis.incr(key);
}

/**
 * Anonymous buy-failure counters (the P3 churn signal): `fail` = one buy tx
 * failed, `stop` = a user hit the 5-fails-in-a-row stop. Self-reported and
 * unverifiable, so treat as directional — never mix into the leaderboard.
 */
export async function recordBuyFail(kind: "fail" | "stop"): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const day = dayKey();
  await Promise.all([
    redis.incr(kind === "stop" ? "stats:buy_stops" : "stats:buy_fails"),
    redis.incr(
      kind === "stop" ? `stats:buy_stops:${day}` : `stats:buy_fails:${day}`
    ),
  ]);
}

// ---- multisend usage ----

export type MultisendRun = {
  wallet: string;
  token: string;
  sym?: string;
  recipients: number;
  confirmed: number;
  failed: number;
  amount: number; // total token amount attempted (display units)
  at: number; // ms
};

/**
 * Record one completed multisend run. Self-reported by the client at the end
 * of a run — no spoof incentive (nothing user-facing keys off it), so we skip
 * on-chain verification and keep it cheap. Keys:
 *   stats:ms:runs / stats:ms:txs      totals (txs = confirmed transfers)
 *   stats:ms:txs:<day>                daily bucket
 *   ms:senders                        zset, score = first-seen ms (NX)
 *   ms:sender:<addr>:txs              per-wallet confirmed transfers
 *   ms:tokens / ms:tokens:sym         transfers per token + display labels
 *   ms:runs                           last 500 runs as JSON (newest first)
 */
export async function recordMultisendRun(run: MultisendRun): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const w = run.wallet.toLowerCase();
  const t = run.token.toLowerCase();
  const writes: Promise<unknown>[] = [
    redis.incr("stats:ms:runs"),
    redis.incrby("stats:ms:txs", run.confirmed),
    redis.incrby(`stats:ms:txs:${dayKey()}`, run.confirmed),
    redis.zadd("ms:senders", { nx: true }, { score: run.at, member: w }),
    redis.incrby(`ms:sender:${w}:txs`, run.confirmed),
    redis.zincrby("ms:tokens", run.confirmed, t),
    redis.lpush("ms:runs", JSON.stringify(run)),
    redis.ltrim("ms:runs", 0, 499),
  ];
  if (run.sym) writes.push(redis.hset("ms:tokens:sym", { [t]: run.sym }));
  await Promise.all(writes);
}

/** One-shot platform counters for the admin summary (dataset=summary). */
export async function readPlatformSummary(): Promise<Record<string, number>> {
  const redis = getRedis();
  if (!redis) return {};
  const day = dayKey();
  const keys = [
    "stats:buys",
    "stats:eth",
    `stats:buys:${day}`,
    `stats:eth:${day}`,
    `stats:visits:${day}`,
    `stats:visits:ms:${day}`,
    "stats:ms:runs",
    "stats:ms:txs",
    `stats:ms:txs:${day}`,
    "stats:buy_fails",
    "stats:buy_stops",
    `stats:airdrop:${day}`,
  ];
  const [vals, created, buyers, senders] = await Promise.all([
    redis.mget<(string | number | null)[]>(...keys),
    redis.zcard("wallets:created"),
    redis.zcard("wallets:bybuys"),
    redis.zcard("ms:senders"),
  ]);
  return {
    buys: num(vals[0]),
    eth: num(vals[1]),
    buysToday: num(vals[2]),
    ethToday: num(vals[3]),
    printVisitsToday: num(vals[4]),
    multisendVisitsToday: num(vals[5]),
    multisendRuns: num(vals[6]),
    multisendTxs: num(vals[7]),
    multisendTxsToday: num(vals[8]),
    buyFails: num(vals[9]),
    buyStops: num(vals[10]),
    airdropSignupsToday: num(vals[11]),
    walletsCreated: num(created),
    buyerWallets: num(buyers),
    multisendSenders: num(senders),
  };
}

/** Every multisend run on record (newest first) + sender totals. */
export async function readMultisendData(): Promise<{
  runs: MultisendRun[];
  senders: { address: string; firstSeen: number; txs: number }[];
}> {
  const redis = getRedis();
  if (!redis) return { runs: [], senders: [] };
  const [rawRuns, flat] = await Promise.all([
    redis.lrange("ms:runs", 0, -1) as Promise<(string | MultisendRun)[]>,
    redis.zrange("ms:senders", 0, -1, { withScores: true }) as Promise<
      (string | number)[]
    >,
  ]);
  const runs: MultisendRun[] = [];
  for (const r of rawRuns) {
    try {
      runs.push(typeof r === "string" ? JSON.parse(r) : r);
    } catch {
      /* skip malformed */
    }
  }
  const senders: { address: string; firstSeen: number; txs: number }[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    senders.push({ address: String(flat[i]), firstSeen: num(flat[i + 1]), txs: 0 });
  }
  if (senders.length) {
    const txs = await redis.mget<(string | number | null)[]>(
      ...senders.map((s) => `ms:sender:${s.address}:txs`)
    );
    senders.forEach((s, i) => (s.txs = num(txs[i])));
  }
  return { runs, senders };
}

export async function readStats(wallet?: string): Promise<PlatformStats> {
  const redis = getRedis();
  if (!redis) return { buys: 0, eth: 0 };
  const w = wallet?.toLowerCase();
  const keys = ["stats:buys", "stats:eth", "stats:gas"];
  if (w) keys.push(`wallet:${w}:buys`, `wallet:${w}:eth`, `wallet:${w}:gas`);
  const vals = await redis.mget<(string | number | null)[]>(...keys);
  const out: PlatformStats = {
    buys: num(vals[0]),
    eth: num(vals[1]),
    gas: num(vals[2]),
  };
  if (w)
    out.wallet = { buys: num(vals[3]), eth: num(vals[4]), gas: num(vals[5]) };
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
  sym?: string,
  gasEth = 0
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

  const day = dayKey();
  const writes: Promise<unknown>[] = [
    redis.incr("stats:buys"),
    redis.incrbyfloat("stats:eth", ethAmount),
    redis.incrbyfloat(`wallet:${w}:eth`, ethAmount),
    // On-chain gas spent (ETH) — a badge of on-chain contribution.
    redis.incrbyfloat("stats:gas", gasEth),
    redis.incrbyfloat(`wallet:${w}:gas`, gasEth),
    redis.incrbyfloat(`stats:gas:${day}`, gasEth),
    // Index of every wallet, ranked by buys — the basis for an airdrop CSV.
    redis.zadd("wallets:bybuys", { score: walletBuys, member: w }),
    // Daily time-series buckets for charting activity over time.
    redis.incr(`stats:buys:${day}`),
    redis.incrbyfloat(`stats:eth:${day}`, ethAmount),
    // First-buy timestamp (NX) → created→bought conversion latency.
    redis.set(`wallet:${w}:first_buy`, Date.now(), { nx: true }),
  ];
  // TODO(P3): consider an anonymous `stats:buy_fails` counter (no wallet)
  // reported by the bot when a buy tx reverts, so churn from the 5-fail
  // stop is visible. Not built yet — see /api/export discussion.

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
  gas?: number;
  tier: string;
  name?: string | null;
};

// Custom display names for the leaderboard, keyed by lowercase address in
// one hash. Set via /api/name, which verifies a signature from the wallet
// itself — only the key holder can name (or rename) their row.
const NAMES_KEY = "lb:names";

export async function setWalletName(addr: string, name: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const a = addr.toLowerCase();
  if (name) await redis.hset(NAMES_KEY, { [a]: name });
  else await redis.hdel(NAMES_KEY, a);
}

/** Top N wallets by buys — the public /print leaderboard. */
export async function readTopWallets(limit = 10): Promise<WalletRow[]> {
  const redis = getRedis();
  if (!redis) return [];
  const n = Math.max(1, Math.min(25, limit));
  const flat = (await redis.zrange("wallets:bybuys", 0, n - 1, {
    rev: true,
    withScores: true,
  })) as (string | number)[];
  const rows: WalletRow[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    const buys = num(flat[i + 1]);
    rows.push({ address: String(flat[i]), buys, eth: 0, tier: tierFor(buys) });
  }
  if (!rows.length) return [];
  const [eths, gases, names] = await Promise.all([
    redis.mget<(string | number | null)[]>(
      ...rows.map((r) => `wallet:${r.address}:eth`)
    ),
    redis.mget<(string | number | null)[]>(
      ...rows.map((r) => `wallet:${r.address}:gas`)
    ),
    redis.hmget<Record<string, string | null>>(
      NAMES_KEY,
      ...rows.map((r) => r.address)
    ),
  ]);
  rows.forEach((r, i) => {
    r.eth = num(eths[i]);
    r.gas = num(gases[i]);
    const n = names?.[r.address];
    r.name = typeof n === "string" && n ? String(n) : null;
  });
  return rows;
}

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

export type CreatedWalletRow = {
  address: string;
  createdAt: number; // first-seen ms
  buys: number;
};

/** Total wallets ever seen by /api/wallet (created or recovered). */
export async function createdWalletCount(): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  return num(await redis.zcard("wallets:created"));
}

/**
 * Every created wallet in first-seen order, joined against its buy count —
 * `buys === 0` is the created-but-never-bought segment. Admin export only.
 */
export async function readCreatedWallets(): Promise<CreatedWalletRow[]> {
  const redis = getRedis();
  if (!redis) return [];
  const flat = (await redis.zrange("wallets:created", 0, -1, {
    withScores: true,
  })) as (string | number)[];
  const rows: { address: string; createdAt: number }[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    rows.push({ address: String(flat[i]), createdAt: num(flat[i + 1]) });
  }
  if (!rows.length) return [];
  const buys = await redis.mget<(string | number | null)[]>(
    ...rows.map((r) => `wallet:${r.address}:buys`)
  );
  return rows.map((r, i) => ({ ...r, buys: num(buys[i]) }));
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
