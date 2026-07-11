import { NextRequest, NextResponse } from "next/server";
import { recordSubmission, ipThrottled, submissionCount } from "@/lib/airdrop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const GEMPAD = new Set(["considering", "farming"]);
const PRESALE = new Set(["0", "0.01", "0.1", "0.3"]);

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// GET → live signup count (cached at the edge so the page can show it cheaply).
export async function GET() {
  const count = await submissionCount();
  return NextResponse.json(
    { count },
    { headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=60" } }
  );
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const address = clean(body.address, 64);
  if (!ADDR_RE.test(address)) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid Robinhood Chain (0x…) address." },
      { status: 400 }
    );
  }

  const telegram = clean(body.telegram, 64).replace(/^@+/, "");
  if (telegram.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Enter your Telegram username." },
      { status: 400 }
    );
  }

  if (!body.joinedTelegram) {
    return NextResponse.json(
      { ok: false, error: "You must join the Telegram to qualify." },
      { status: 400 }
    );
  }

  const gempadChecked = clean(body.gempadChecked, 20);
  if (!GEMPAD.has(gempadChecked)) {
    return NextResponse.json(
      { ok: false, error: "Answer the GemPad presale question." },
      { status: 400 }
    );
  }

  const presaleEth = clean(body.presaleEth, 8);
  if (!PRESALE.has(presaleEth)) {
    return NextResponse.json(
      { ok: false, error: "Answer the presale amount question." },
      { status: 400 }
    );
  }

  const xFollowed = body.xFollowed === true || body.xFollowed === "yes";

  const betaAware = clean(body.betaAware, 8);
  if (betaAware !== "aware" && betaAware !== "free") {
    return NextResponse.json(
      { ok: false, error: "Answer the beta-testing question." },
      { status: 400 }
    );
  }

  // Soft anti-spam: cap submissions per IP per hour. Dedupe by address handles
  // honest resubmits (they keep their original rank).
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "";
  if (await ipThrottled(ip)) {
    return NextResponse.json(
      { ok: false, error: "Too many submissions. Try again later." },
      { status: 429 }
    );
  }

  const res = await recordSubmission({
    address,
    telegram,
    joinedTelegram: true,
    gempadChecked,
    presaleEth,
    xFollowed,
    betaAware,
  });

  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: "Signups are temporarily unavailable. Try again soon." },
      { status: 503 }
    );
  }

  return NextResponse.json(
    { ok: true, rank: res.rank, tier: res.tier, already: res.already },
    { headers: { "cache-control": "no-store" } }
  );
}
