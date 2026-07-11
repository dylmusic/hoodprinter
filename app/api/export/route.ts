import { NextRequest, NextResponse } from "next/server";
import { readAllWallets, backfillWallets } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Airdrop export — every wallet with its buys, ETH volume, and rank tier.
 * Gated by STATS_ADMIN_KEY (set it in Vercel env). Usage:
 *   /api/export?key=SECRET            → download wallets CSV
 *   /api/export?key=SECRET&format=json→ JSON instead of CSV
 *   /api/export?key=SECRET&backfill=1 → seed the index from existing wallets
 */
export async function GET(req: NextRequest) {
  const secret = process.env.STATS_ADMIN_KEY;
  const key = req.nextUrl.searchParams.get("key");
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "STATS_ADMIN_KEY is not set" },
      { status: 503 }
    );
  }
  if (key !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (req.nextUrl.searchParams.get("backfill")) {
    const indexed = await backfillWallets();
    return NextResponse.json({ ok: true, indexed });
  }

  const rows = await readAllWallets();

  if (req.nextUrl.searchParams.get("format") === "json") {
    return NextResponse.json(
      { ok: true, count: rows.length, wallets: rows },
      { headers: { "cache-control": "no-store" } }
    );
  }

  const header = "address,buys,eth_volume,tier";
  const body = rows
    .map((r) => `${r.address},${r.buys},${r.eth},${r.tier}`)
    .join("\n");
  const csv = `${header}\n${body}\n`;
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="hoodprint-wallets-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
