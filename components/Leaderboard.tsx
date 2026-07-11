"use client";

import { useEffect, useState } from "react";

/**
 * Wallet leaderboard for /print — top printers by confirmed buys.
 * Reads the CDN-cached /api/stats?board endpoint; highlights the viewer's
 * own bot wallet when it's on the board.
 */

type Row = { address: string; buys: number; eth: number; tier: string };

const TIER_COLORS: Record<string, string> = {
  Rookie: "#8b93a7",
  Bronze: "#cd7f32",
  Silver: "#cbd3dc",
  Gold: "#ffd24a",
  Platinum: "#6ad0ff",
  Diamond: "#b9f2ff",
};

const MEDALS = ["🥇", "🥈", "🥉"];

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const fmtEth = (n: number) =>
  n >= 1 ? n.toFixed(3) : n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");

export default function Leaderboard({ me }: { me?: string | null }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/stats?board=10");
        const json = await res.json();
        if (alive && Array.isArray(json.board)) setRows(json.board);
      } catch {
        /* board is decorative — fail quietly */
      }
    };
    load();
    const id = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!rows || rows.length === 0) return null;

  const meLower = me?.toLowerCase();

  return (
    <section className="pb-card lb-card">
      <div className="lb-head">
        <h2>🏆 Leaderboard</h2>
        <span className="lb-sub">top printers by confirmed buys</span>
      </div>
      <div className="lb-rows">
        {rows.map((r, i) => {
          const isMe = meLower && r.address.toLowerCase() === meLower;
          return (
            <div className={`lb-row${i < 3 ? " top" : ""}${isMe ? " me" : ""}`} key={r.address}>
              <span className="lb-rank">{MEDALS[i] ?? `#${i + 1}`}</span>
              <span className="lb-addr">
                {short(r.address)}
                {isMe && <span className="lb-you">YOU</span>}
              </span>
              <span
                className="lb-tier"
                style={{
                  color: TIER_COLORS[r.tier] || "#8b93a7",
                  borderColor: (TIER_COLORS[r.tier] || "#8b93a7") + "66",
                }}
              >
                {r.tier}
              </span>
              <span className="lb-buys">
                {r.buys.toLocaleString()} <em>buys</em>
              </span>
              <span className="lb-eth">{fmtEth(r.eth)} ETH</span>
            </div>
          );
        })}
      </div>
      <p className="lb-note">
        Every confirmed buy climbs the board. Level up before rewards go live.
      </p>
    </section>
  );
}
