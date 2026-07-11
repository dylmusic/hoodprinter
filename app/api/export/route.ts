import { NextRequest, NextResponse } from "next/server";
import { readAllWallets, backfillWallets } from "@/lib/stats";
import { readAllSubmissions } from "@/lib/airdrop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin data export. Gated by STATS_ADMIN_KEY (set it in Vercel env). Usage:
 *   /api/export?key=SECRET                    → buy-bot wallets CSV
 *   /api/export?key=SECRET&dataset=airdrop    → airdrop signups CSV (FCFS order)
 *   /api/export?key=SECRET&format=json        → JSON instead of CSV
 *   /api/export?key=SECRET&backfill=1         → seed the wallet index
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

  const asJson = req.nextUrl.searchParams.get("format") === "json";
  const stamp = new Date().toISOString().slice(0, 10);
  const csvField = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

  // ---- airdrop signups ----
  if (req.nextUrl.searchParams.get("dataset") === "airdrop") {
    const subs = await readAllSubmissions();
    if (asJson) {
      return NextResponse.json(
        { ok: true, count: subs.length, signups: subs },
        { headers: { "cache-control": "no-store" } }
      );
    }
    const header =
      "rank,address,telegram,joined_telegram,gempad_checked,presale_eth_intent,x_followed,tier,submitted_at";
    const body = subs
      .map((s) =>
        [
          s.rank,
          s.address,
          csvField(s.telegram),
          s.joinedTelegram ? "yes" : "no",
          s.gempadChecked,
          s.presaleEth,
          s.xFollowed ? "yes" : "no",
          s.tier,
          s.submittedAt ? new Date(s.submittedAt).toISOString() : "",
        ].join(",")
      )
      .join("\n");
    return new NextResponse(`${header}\n${body}\n`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="hoodprint-airdrop-${stamp}.csv"`,
        "cache-control": "no-store",
      },
    });
  }

  // ---- buy-bot wallets (default) ----
  const rows = await readAllWallets();
  if (asJson) {
    return NextResponse.json(
      { ok: true, count: rows.length, wallets: rows },
      { headers: { "cache-control": "no-store" } }
    );
  }

  const header = "address,buys,eth_volume,tier";
  const body = rows
    .map((r) => `${r.address},${r.buys},${r.eth},${r.tier}`)
    .join("\n");
  return new NextResponse(`${header}\n${body}\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="hoodprint-wallets-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
