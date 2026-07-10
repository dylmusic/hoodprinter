import { NextRequest, NextResponse } from "next/server";
import { recordBuy } from "@/lib/stats";
import { siteConfig } from "@/site.config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RPC = siteConfig.chain.rpcUrl;

async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
  try {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      cache: "no-store",
    });
    const json = await res.json();
    return (json?.result ?? null) as T | null;
  } catch {
    return null;
  }
}

/**
 * Count a confirmed buy toward the platform + wallet totals.
 * "Verified": we re-check the tx on-chain (must exist, succeed, and come
 * from the claimed wallet) and take the ETH amount from the tx itself, so
 * the counters can't be inflated by a spoofed request.
 */
export async function POST(req: NextRequest) {
  let body: { wallet?: string; txHash?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const wallet = (body.wallet || "").trim();
  const txHash = (body.txHash || "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ ok: false, error: "bad wallet" }, { status: 400 });
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return NextResponse.json({ ok: false, error: "bad txHash" }, { status: 400 });
  }

  // Verify on-chain.
  const tx = await rpc<{ from: string; value: string }>(
    "eth_getTransactionByHash",
    [txHash]
  );
  const receipt = await rpc<{ status: string }>("eth_getTransactionReceipt", [
    txHash,
  ]);
  if (!tx || !receipt) {
    return NextResponse.json(
      { ok: false, error: "tx not found" },
      { status: 404 }
    );
  }
  if (receipt.status !== "0x1") {
    return NextResponse.json({ ok: false, error: "tx failed" }, { status: 400 });
  }
  if ((tx.from || "").toLowerCase() !== wallet.toLowerCase()) {
    return NextResponse.json(
      { ok: false, error: "wallet mismatch" },
      { status: 400 }
    );
  }

  // Trust the on-chain value, not the client, for volume.
  let ethAmount = 0;
  try {
    ethAmount = Number(BigInt(tx.value || "0x0")) / 1e18;
  } catch {
    ethAmount = 0;
  }

  const { counted } = await recordBuy(wallet, txHash, ethAmount);
  return NextResponse.json({ ok: true, counted, ethAmount });
}
