import { NextRequest, NextResponse } from "next/server";
import { readAllWallets, backfillWallets } from "@/lib/stats";
import { readAllSubmissions, seedSubmission } from "@/lib/airdrop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin data export. Gated by STATS_ADMIN_KEY (set it in Vercel env). Usage:
 *   /api/export?key=SECRET                    → buy-bot wallets CSV
 *   /api/export?key=SECRET&dataset=airdrop    → airdrop signups CSV (FCFS order)
 *   /api/export?key=SECRET&format=json        → JSON instead of CSV
 *   /api/export?key=SECRET&backfill=1         → seed the wallet index
 * POST /api/export?import=airdrop&key=SECRET  → import old Google-Form CSV
 *   (send the raw CSV as the request body)
 */

const GEMPAD_MAP: Record<string, string> = {
  "yes. i'm considering buying some.": "considering",
  "no. i'm just here to farm the airdrop.": "farming",
};
function mapGempad(v: string): string {
  return GEMPAD_MAP[v.trim().toLowerCase()] || (v.toLowerCase().startsWith("yes") ? "considering" : "farming");
}
function mapPresale(v: string): string {
  const m = v.match(/^\s*(0\.3|0\.1|0\.01|0)\b/);
  return m ? m[1] : "0";
}
// Minimal CSV line splitter that respects double-quoted fields.
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

export async function POST(req: NextRequest) {
  const secret = process.env.STATS_ADMIN_KEY;
  const key = req.nextUrl.searchParams.get("key");
  if (!secret) {
    return NextResponse.json({ ok: false, error: "STATS_ADMIN_KEY is not set" }, { status: 503 });
  }
  if (key !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (req.nextUrl.searchParams.get("import") !== "airdrop") {
    return NextResponse.json({ ok: false, error: "unknown import" }, { status: 400 });
  }

  const text = await req.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return NextResponse.json({ ok: false, error: "empty CSV" }, { status: 400 });
  }

  // Columns (old Google Form export):
  // Timestamp, Joined TG, ETH Address, Telegram Username, GemPad?, Presale ETH?, Followed+Repost?
  type Parsed = { ts: number; sub: Parameters<typeof seedSubmission>[0] };
  const parsed: Parsed[] = [];
  const skipped: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const f = splitCsvLine(lines[i]);
    const [tsRaw, joined, address, telegram, gempad, presale, xfollow] = f;
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address.trim())) {
      skipped.push(lines[i].slice(0, 60));
      continue;
    }
    const ts = Date.parse(tsRaw);
    parsed.push({
      ts: Number.isFinite(ts) ? ts : Date.now(),
      sub: {
        address: address.trim(),
        telegram: (telegram || "").trim().replace(/^@+/, ""),
        joinedTelegram: /yes/i.test(joined || ""),
        gempadChecked: mapGempad(gempad || ""),
        presaleEth: mapPresale(presale || ""),
        xFollowed: /yes/i.test(xfollow || ""),
        betaAware: "", // question didn't exist on the old Google Form
      },
    });
  }

  // Seed oldest-first so NX assigns the earliest timestamp/rank per address.
  parsed.sort((a, b) => a.ts - b.ts);
  let added = 0;
  for (const p of parsed) {
    if (await seedSubmission(p.sub, p.ts)) added++;
  }

  return NextResponse.json({
    ok: true,
    rows: parsed.length,
    added,
    duplicates: parsed.length - added,
    skipped: skipped.length,
  });
}

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
      "rank,address,telegram,joined_telegram,gempad_checked,presale_eth_intent,x_followed,beta_aware,tier,submitted_at";
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
          s.betaAware,
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
