import { NextRequest, NextResponse } from "next/server";
import { ipThrottled, recordMultisendRun } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

const toCount = (v: unknown, cap: number): number => {
  const n = typeof v === "number" ? Math.floor(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.min(n, cap) : 0;
};

/**
 * Usage telemetry for /multisend: one POST per completed send run.
 * Self-reported (nothing user-facing keys off it), best-effort, throttled.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const wallet = typeof body.wallet === "string" ? body.wallet.trim() : "";
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!ADDR_RE.test(wallet) || !ADDR_RE.test(token)) {
    return NextResponse.json({ ok: false, error: "bad address" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "";
  if (await ipThrottled("multisend", ip, 60)) {
    return NextResponse.json({ ok: false, error: "throttled" }, { status: 429 });
  }

  try {
    const amount =
      typeof body.amount === "number" && Number.isFinite(body.amount) && body.amount >= 0
        ? body.amount
        : 0;
    await recordMultisendRun({
      wallet,
      token,
      sym: typeof body.sym === "string" ? body.sym.slice(0, 16) : undefined,
      recipients: toCount(body.recipients, 1_000_000),
      confirmed: toCount(body.confirmed, 1_000_000),
      failed: toCount(body.failed, 1_000_000),
      amount,
      at: Date.now(),
    });
  } catch {
    /* telemetry is best-effort */
  }
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
