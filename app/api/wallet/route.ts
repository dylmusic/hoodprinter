import { NextRequest, NextResponse } from "next/server";
import { ipThrottled, recordVisit, recordWalletCreated } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Best-effort funnel telemetry from the /print bot. Two shapes:
 *   POST { address }          → record a bot wallet's existence (creation or
 *                               recovery from a returning user's localStorage).
 *   POST { type: "visit" }    → count a /print landing into today's bucket.
 *
 * Only ever receives a derived ADDRESS — the private key never leaves the
 * browser and there is no code path that sends it. Fire-and-forget on the
 * client; internal failures here return ok so the bot UI is never affected.
 */
export async function POST(req: NextRequest) {
  let body: { address?: unknown; type?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "";

  try {
    if (body.type === "visit") {
      // Landings are frequent by nature — throttle generously.
      if (!(await ipThrottled("visit", ip, 120))) await recordVisit();
      return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
    }

    const address = typeof body.address === "string" ? body.address.trim() : "";
    if (!ADDR_RE.test(address)) {
      return NextResponse.json({ ok: false, error: "bad address" }, { status: 400 });
    }
    if (await ipThrottled("wallet", ip, 30)) {
      return NextResponse.json({ ok: false, error: "throttled" }, { status: 429 });
    }
    await recordWalletCreated(address);
  } catch {
    /* telemetry is best-effort — never surface an error to the bot */
  }
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
