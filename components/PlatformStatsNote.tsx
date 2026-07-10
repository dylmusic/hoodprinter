"use client";

import { useEffect, useRef, useState } from "react";

// Small platform-growth note shown directly under the page title.
// Self-fetches the CDN-cached platform totals, then ticks the displayed
// numbers up ONE buy at a time at irregular intervals — with a gold flash on
// each tick — so it feels like a live game instead of jumping in lumps.
function fmtEth(v: number): string {
  if (v === 0) return "0";
  if (v >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (v >= 1) return v.toLocaleString("en-US", { maximumFractionDigits: 4 });
  // Small balances (testing): show down to 0.00001 ETH.
  return v.toFixed(5).replace(/0+$/, "").replace(/\.$/, "");
}

export default function PlatformStatsNote() {
  const [dispBuys, setDispBuys] = useState<number | null>(null);
  const [dispEth, setDispEth] = useState(0);
  const [pulse, setPulse] = useState(0); // remounts numbers to replay the flash

  const target = useRef({ buys: 0, eth: 0 });
  const disp = useRef({ buys: 0, eth: 0 });
  const inited = useRef(false);
  const tickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;

    // Consume the gap between displayed and target one buy at a time, pacing
    // the ticks across the poll window with random jitter so it feels alive.
    const scheduleTick = () => {
      if (tickTimer.current) return; // a run is already in flight
      const step = () => {
        tickTimer.current = null;
        const t = target.current;
        const d = disp.current;
        if (d.buys >= t.buys) {
          if (d.eth !== t.eth) {
            d.eth = t.eth;
            setDispEth(t.eth);
          }
          return;
        }
        const remaining = t.buys - d.buys;
        d.buys += 1;
        // ease ETH toward target proportionally to buys consumed
        d.eth += (t.eth - d.eth) / remaining;
        setDispBuys(d.buys);
        setDispEth(d.eth);
        setPulse((p) => p + 1);
        // Spread remaining ticks over ~9s, sped up if many are pending, jittered.
        const base = Math.min(2600, Math.max(250, 9000 / remaining));
        const delay = base * (0.5 + Math.random());
        tickTimer.current = setTimeout(step, delay);
      };
      tickTimer.current = setTimeout(step, 200 + Math.random() * 600);
    };

    const load = async () => {
      try {
        const res = await fetch("/api/stats");
        if (!res.ok) return;
        const s = await res.json();
        if (!alive) return;
        const nb = typeof s.buys === "number" ? s.buys : 0;
        const ne = typeof s.eth === "number" ? s.eth : 0;
        target.current = { buys: nb, eth: ne };
        if (!inited.current) {
          // First load: snap straight to the real totals, no animation.
          inited.current = true;
          disp.current = { buys: nb, eth: ne };
          setDispBuys(nb);
          setDispEth(ne);
        } else {
          scheduleTick();
        }
      } catch {
        /* best-effort */
      }
    };

    load();
    const id = setInterval(load, 12000);
    return () => {
      alive = false;
      clearInterval(id);
      if (tickTimer.current) clearTimeout(tickTimer.current);
    };
  }, []);

  const glow = pulse > 0 ? "pb-hstat-num pb-pulse" : "pb-hstat-num";
  return (
    <div className="pb-hstats" aria-label="Platform totals">
      <div className="pb-hstat">
        <span key={`b${pulse}`} className={glow}>
          {dispBuys == null ? "—" : dispBuys.toLocaleString("en-US")}
        </span>
        <span className="pb-hstat-label">Total buys</span>
      </div>
      <span className="pb-hstat-div" />
      <div className="pb-hstat">
        <span key={`e${pulse}`} className={glow}>
          {dispBuys == null ? "—" : fmtEth(dispEth)}
        </span>
        <span className="pb-hstat-label">ETH volume</span>
      </div>
    </div>
  );
}
