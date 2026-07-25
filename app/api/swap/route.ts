import { NextRequest, NextResponse } from "next/server";
import { ipThrottled, recordSwap, readSwapStats } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Usage telemetry for /swap: one POST per completed swap. Self-reported
 * (nothing user-facing keys off it — same tradeoff already made for
 * /api/multisend), best-effort, throttled.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const wallet = typeof body.wallet === "string" ? body.wallet.trim() : "";
  if (!ADDR_RE.test(wallet)) {
    return NextResponse.json({ ok: false, error: "bad address" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "";
  if (await ipThrottled("swap", ip, 60)) {
    return NextResponse.json({ ok: false, error: "throttled" }, { status: 429 });
  }

  try {
    const ethValue =
      typeof body.ethValue === "number" && Number.isFinite(body.ethValue) && body.ethValue >= 0
        ? body.ethValue
        : 0;
    await recordSwap({
      wallet,
      plan: typeof body.plan === "string" ? body.plan.slice(0, 32) : "unknown",
      fromSym: typeof body.fromSym === "string" ? body.fromSym.slice(0, 16) : "",
      toSym: typeof body.toSym === "string" ? body.toSym.slice(0, 16) : "",
      ethValue,
    });
  } catch {
    /* telemetry is best-effort */
  }
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}

// Platform-wide swap totals — identical for everyone, so let the CDN collapse
// concurrent viewers into ~one Redis read, same as /api/stats.
export async function GET() {
  const stats = await readSwapStats();
  return NextResponse.json(stats, {
    headers: { "cache-control": "public, s-maxage=10, stale-while-revalidate=60" },
  });
}
