import { NextRequest, NextResponse } from "next/server";
import { APP_FEE_BPS, RELAY_CHAIN_ID } from "@/lib/relay";
import { RELAY_FEE_RECIPIENT } from "@/site.config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Proxies quote/v2 to Relay so the API key stays server-side and the
 * appFees recipient/bps are set here — not trusted from the client body —
 * so a modified client can't redirect or strip our 0.85% cut. Chain IDs are
 * likewise pinned to Robinhood Chain regardless of what's sent; this proxy
 * is scoped to the /swap widget's same-chain ETH<->token flow, not a general
 * cross-chain relay for arbitrary requests.
 *
 * Relay's currency matching is case-sensitive (lowercase, not EIP-55
 * checksummed) — verified empirically, a checksummed address 404s with
 * INVALID_INPUT_CURRENCY.
 */
export async function POST(req: NextRequest) {
  let body: {
    user?: unknown;
    originCurrency?: unknown;
    destinationCurrency?: unknown;
    amount?: unknown;
    tradeType?: unknown;
    slippageTolerance?: unknown;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Bad request body." }, { status: 400 });
  }

  const user = typeof body.user === "string" ? body.user : "";
  const originCurrency = typeof body.originCurrency === "string" ? body.originCurrency : "";
  const destinationCurrency = typeof body.destinationCurrency === "string" ? body.destinationCurrency : "";
  const amount = typeof body.amount === "string" ? body.amount : "";
  const tradeType = typeof body.tradeType === "string" ? body.tradeType : "EXACT_INPUT";
  const slippageTolerance = typeof body.slippageTolerance === "string" ? body.slippageTolerance : "1000";

  if (!ADDR_RE.test(user) || !ADDR_RE.test(originCurrency) || !ADDR_RE.test(destinationCurrency) || !amount) {
    return NextResponse.json({ message: "Invalid quote request." }, { status: 400 });
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.RELAY_API_KEY) headers["x-api-key"] = process.env.RELAY_API_KEY;

  try {
    const upstream = await fetch("https://api.relay.link/quote/v2", {
      method: "POST",
      headers,
      body: JSON.stringify({
        user: user.toLowerCase(),
        originChainId: RELAY_CHAIN_ID,
        destinationChainId: RELAY_CHAIN_ID,
        originCurrency: originCurrency.toLowerCase(),
        destinationCurrency: destinationCurrency.toLowerCase(),
        amount,
        tradeType,
        slippageTolerance,
        appFees: [{ recipient: RELAY_FEE_RECIPIENT.toLowerCase(), fee: APP_FEE_BPS }],
      }),
    });
    const json = await upstream.json();
    return NextResponse.json(json, { status: upstream.status, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "Couldn't reach Relay. Try again." }, { status: 502 });
  }
}
