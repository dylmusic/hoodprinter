import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { ipThrottled, setWalletName } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
// Display names: letters, numbers, spaces, @ . _ - ( ) !, 2–24 chars.
// Empty string clears the name.
const NAME_RE = /^[\w@.()\-! ]{2,24}$/;

/**
 * Set a leaderboard display name. Ownership-proved: the client signs
 * `hoodprint:set-name:<addr_lower>:<name>` with the bot wallet's key and we
 * recover the signer — so only the key holder can name their own row.
 */
export async function POST(req: NextRequest) {
  let body: { address?: unknown; name?: unknown; sig?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const address = typeof body.address === "string" ? body.address.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const sig = typeof body.sig === "string" ? body.sig : "";
  if (!ADDR_RE.test(address)) {
    return NextResponse.json({ ok: false, error: "bad address" }, { status: 400 });
  }
  if (name !== "" && !NAME_RE.test(name)) {
    return NextResponse.json(
      { ok: false, error: "Name must be 2–24 characters: letters, numbers, spaces, @ . _ - ( ) !" },
      { status: 400 }
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "";
  if (await ipThrottled("name", ip, 20)) {
    return NextResponse.json({ ok: false, error: "throttled" }, { status: 429 });
  }

  // Verify the signature — the message binds this exact name to this wallet.
  try {
    const msg = `hoodprint:set-name:${address.toLowerCase()}:${name}`;
    const signer = ethers.verifyMessage(msg, sig);
    if (signer.toLowerCase() !== address.toLowerCase()) {
      return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  await setWalletName(address, name);
  return NextResponse.json(
    { ok: true, name: name || null },
    { headers: { "cache-control": "no-store" } }
  );
}
