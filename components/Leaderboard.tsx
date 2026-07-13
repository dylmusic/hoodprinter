"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";

/**
 * Wallet leaderboard for /print — top printers by confirmed buys.
 * Reads the CDN-cached /api/stats?board endpoint; highlights the viewer's
 * own bot wallet and lets them set a display name (signed with the wallet
 * key, so only the owner can rename their row — everyone sees the name).
 */

type Row = {
  address: string;
  buys: number;
  eth: number;
  gas?: number;
  tier: string;
  name?: string | null;
};

const PK_STORAGE_KEY = "hoodprint_burner_pk"; // shared with PrintBot

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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    try {
      const res = await fetch("/api/stats?board=10");
      const json = await res.json();
      if (Array.isArray(json.board)) setRows(json.board);
    } catch {
      /* board is decorative — fail quietly */
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  if (!rows || rows.length === 0) return null;

  const meLower = me?.toLowerCase();

  async function saveName() {
    if (!me) return;
    const name = draft.trim();
    if (name && !/^[\w@.()\-! ]{2,21}$/.test(name)) {
      setErr("2–21 characters: letters, numbers, spaces, @ . _ - ( ) !");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const pkRaw = localStorage.getItem(PK_STORAGE_KEY) || "";
      const pk = pkRaw.startsWith("0x") ? pkRaw : "0x" + pkRaw;
      const wallet = new ethers.Wallet(pk);
      if (wallet.address.toLowerCase() !== meLower) throw new Error("key mismatch");
      const sig = await wallet.signMessage(
        `hoodprint:set-name:${wallet.address.toLowerCase()}:${name}`
      );
      const res = await fetch("/api/name", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: wallet.address, name, sig }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "failed");
      // Optimistic update (the CDN-cached board lags a few seconds).
      setRows((rs) =>
        rs
          ? rs.map((r) =>
              r.address.toLowerCase() === meLower ? { ...r, name: name || null } : r
            )
          : rs
      );
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error && e.message.length < 80 ? e.message : "Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="pb-card lb-card">
      <div className="lb-head">
        <h2>🏆 Leaderboard</h2>
        <span className="lb-sub">top printers by confirmed buys</span>
      </div>
      <div className="lb-rows">
        {rows.map((r, i) => {
          const isMe = !!meLower && r.address.toLowerCase() === meLower;
          return (
            <div className={`lb-row${i < 3 ? " top" : ""}${isMe ? " me" : ""}`} key={r.address}>
              <span className="lb-rank">{MEDALS[i] ?? `#${i + 1}`}</span>
              <span className="lb-addr" title={r.address}>
                {isMe && editing ? (
                  <span className="lb-edit">
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveName()}
                      placeholder="X / Telegram name"
                      maxLength={21}
                      autoFocus
                      disabled={saving}
                    />
                    <button type="button" onClick={saveName} disabled={saving} title="Save">
                      {saving ? "…" : "✓"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(false);
                        setErr("");
                      }}
                      disabled={saving}
                      title="Cancel"
                    >
                      ✕
                    </button>
                  </span>
                ) : (
                  <>
                    {r.name ? (
                      <span className="lb-name">{r.name}</span>
                    ) : (
                      short(r.address)
                    )}
                    {r.name && <span className="lb-addr-sub">{short(r.address)}</span>}
                    {isMe && <span className="lb-you">YOU</span>}
                    {isMe && (
                      <button
                        type="button"
                        className="lb-pencil"
                        title="Set your leaderboard name"
                        onClick={() => {
                          setDraft(r.name || "");
                          setEditing(true);
                          setErr("");
                        }}
                      >
                        ✏️
                      </button>
                    )}
                  </>
                )}
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
              <span
                className="lb-buys"
                title={
                  r.gas && r.gas > 0
                    ? `${fmtEth(r.gas)} ETH gas spent on-chain`
                    : undefined
                }
              >
                {r.buys.toLocaleString()} <em>buys</em>
              </span>
              <span className="lb-eth">{fmtEth(r.eth)} ETH</span>
              {isMe && editing && err && (
                <span className="lb-err-inline">{err}</span>
              )}
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
