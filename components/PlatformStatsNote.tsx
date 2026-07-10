"use client";

import { useEffect, useState } from "react";

// Small platform-growth note shown directly under the page title.
// Self-fetches the CDN-cached platform totals; no wallet needed.
function fmt(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (v >= 1) return v.toLocaleString("en-US", { maximumFractionDigits: 4 });
  if (v === 0) return "0";
  return v.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

export default function PlatformStatsNote() {
  const [buys, setBuys] = useState<number | null>(null);
  const [eth, setEth] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/stats");
        if (!res.ok) return;
        const s = await res.json();
        if (!alive) return;
        setBuys(typeof s.buys === "number" ? s.buys : 0);
        setEth(typeof s.eth === "number" ? s.eth : 0);
      } catch {
        /* best-effort */
      }
    };
    load();
    const id = setInterval(load, 12000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="pb-hstats" aria-label="Platform totals">
      <div className="pb-hstat">
        <span className="pb-hstat-num">
          {buys == null ? "—" : buys.toLocaleString("en-US")}
        </span>
        <span className="pb-hstat-label">Total buys</span>
      </div>
      <span className="pb-hstat-div" />
      <div className="pb-hstat">
        <span className="pb-hstat-num">{fmt(eth)}</span>
        <span className="pb-hstat-label">ETH volume</span>
      </div>
    </div>
  );
}
