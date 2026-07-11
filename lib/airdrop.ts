import { getRedis } from "./stats";

/**
 * Native $PRINT airdrop signups — replaces the old Google Form.
 * Stored in the same Upstash Redis as the buy-bot stats.
 *
 * Keys:
 *   airdrop:order        sorted set, score = first-seen timestamp (ms), member
 *                        = lowercased ETH address. This preserves first-come-
 *                        first-served order (the basis for the 100 / 1000 tiers)
 *                        and lets us enumerate + count every signup.
 *   airdrop:sub:<addr>   hash of that address's full answer set.
 *   airdrop:ip:<ip>      soft per-IP throttle counter (24h TTL).
 */

export type AirdropSubmission = {
  address: string;
  telegram: string;
  joinedTelegram: boolean;
  gempadChecked: string; // "considering" | "farming"
  presaleEth: string; // "0" | "0.01" | "0.1" | "0.3"
  xFollowed: boolean;
};

export type AirdropTier = "big" | "small" | "waitlist";

export type AirdropRow = AirdropSubmission & {
  rank: number;
  tier: AirdropTier;
  submittedAt: number;
};

const ORDER_KEY = "airdrop:order";
const subKey = (a: string) => `airdrop:sub:${a}`;

export function tierForRank(rank: number): AirdropTier {
  if (rank <= 100) return "big";
  if (rank <= 1000) return "small";
  return "waitlist";
}

/** Store/refresh a signup. First submission fixes the FCFS timestamp; later
 *  edits from the same address update the answers but keep the original rank. */
export async function recordSubmission(
  sub: AirdropSubmission
): Promise<{ ok: boolean; rank: number; tier: AirdropTier; already: boolean }> {
  const redis = getRedis();
  if (!redis) return { ok: false, rank: 0, tier: "waitlist", already: false };
  const a = sub.address.toLowerCase();
  const now = Date.now();

  // Only set the order score if this address hasn't signed up before, so the
  // first-seen time (and therefore the rank) is immutable across resubmits.
  const added = await redis.zadd(
    ORDER_KEY,
    { nx: true },
    { score: now, member: a }
  );

  const hash: Record<string, string> = {
    address: sub.address,
    telegram: sub.telegram,
    joinedTelegram: sub.joinedTelegram ? "1" : "0",
    gempadChecked: sub.gempadChecked,
    presaleEth: sub.presaleEth,
    xFollowed: sub.xFollowed ? "1" : "0",
    updatedAt: String(now),
  };
  if (added) hash.submittedAt = String(now);
  await redis.hset(subKey(a), hash);

  const idx = await redis.zrank(ORDER_KEY, a);
  const rank = (idx ?? 0) + 1;
  return { ok: true, rank, tier: tierForRank(rank), already: !added };
}

/** Seed a signup with an explicit original timestamp (for migrating the old
 *  Google Form responses). NX on the order set keeps the earliest time, so
 *  running the import twice — or after someone re-signs — never reshuffles
 *  ranks. Returns whether this address was newly added. */
export async function seedSubmission(
  sub: AirdropSubmission,
  timestampMs: number
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  const a = sub.address.toLowerCase();
  const added = await redis.zadd(
    ORDER_KEY,
    { nx: true },
    { score: timestampMs, member: a }
  );
  const hash: Record<string, string> = {
    address: sub.address,
    telegram: sub.telegram,
    joinedTelegram: sub.joinedTelegram ? "1" : "0",
    gempadChecked: sub.gempadChecked,
    presaleEth: sub.presaleEth,
    xFollowed: sub.xFollowed ? "1" : "0",
  };
  if (added) hash.submittedAt = String(timestampMs);
  hash.updatedAt = String(Date.now());
  // Only write answers if this is a fresh address, so an import can't clobber
  // newer native-form answers from someone who already re-submitted.
  if (added) await redis.hset(subKey(a), hash);
  return !!added;
}

/** Total number of signups (for the live count on the page). */
export async function submissionCount(): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  return (await redis.zcard(ORDER_KEY)) ?? 0;
}

/** Soft per-IP throttle. Returns true if this IP is over the hourly limit. */
export async function ipThrottled(ip: string, limit = 12): Promise<boolean> {
  const redis = getRedis();
  if (!redis || !ip) return false;
  const key = `airdrop:ip:${ip}`;
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, 60 * 60);
  return n > limit;
}

/** Every signup in FCFS order, with computed rank + tier. Admin export only. */
export async function readAllSubmissions(): Promise<AirdropRow[]> {
  const redis = getRedis();
  if (!redis) return [];
  const addrs = (await redis.zrange(ORDER_KEY, 0, -1)) as string[]; // ascending
  if (!addrs.length) return [];
  const hashes = await Promise.all(
    addrs.map((a) => redis.hgetall(subKey(a)) as Promise<Record<string, string> | null>)
  );
  const rows: AirdropRow[] = [];
  hashes.forEach((h, i) => {
    if (!h) return;
    const rank = i + 1;
    rows.push({
      address: h.address || addrs[i],
      telegram: h.telegram || "",
      joinedTelegram: h.joinedTelegram === "1",
      gempadChecked: h.gempadChecked || "",
      presaleEth: h.presaleEth || "",
      xFollowed: h.xFollowed === "1",
      rank,
      tier: tierForRank(rank),
      submittedAt: Number(h.submittedAt || h.updatedAt || 0),
    });
  });
  return rows;
}
