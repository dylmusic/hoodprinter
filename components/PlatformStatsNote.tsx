"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Small platform-growth note shown directly under the page title.
// Ticks the numbers up ONE buy at a time at irregular intervals — with a gold
// flash on each tick — so it feels like a live game. While the local bot is
// running we know buys are landing, so every confirmed buy nudges the ticker
// immediately (matching the real buy rate) and we poll fresher to catch others.
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
  const [live, setLive] = useState(false); // local bot running → poll fresher

  const target = useRef({ buys: 0, eth: 0 });
  const disp = useRef({ buys: 0, eth: 0 });
  const inited = useRef(false);
  const liveRef = useRef(false);
  const tickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Consume the gap between displayed and target one buy at a time, pacing the
  // ticks with random jitter; speeds up when many buys are pending.
  const scheduleTick = useCallback(() => {
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
      d.eth += (t.eth - d.eth) / remaining; // ease ETH toward target
      setDispBuys(d.buys);
      setDispEth(d.eth);
      setPulse((p) => p + 1);
      const base = Math.min(2000, Math.max(120, 5000 / remaining));
      const delay = base * (0.45 + Math.random() * 0.9);
      tickTimer.current = setTimeout(step, delay);
    };
    tickTimer.current = setTimeout(step, 150 + Math.random() * 500);
  }, []);

  // Raise the target to an absolute total (monotonic — totals never shrink).
  const applyAbsolute = useCallback(
    (nb: number, ne: number) => {
      target.current = {
        buys: Math.max(target.current.buys, nb),
        eth: Math.max(target.current.eth, ne),
      };
      if (!inited.current) {
        inited.current = true;
        disp.current = { ...target.current };
        setDispBuys(disp.current.buys);
        setDispEth(disp.current.eth);
      } else {
        scheduleTick();
      }
    },
    [scheduleTick]
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        "/api/stats",
        liveRef.current ? { cache: "no-store" } : undefined
      );
      if (!res.ok) return;
      const s = await res.json();
      applyAbsolute(
        typeof s.buys === "number" ? s.buys : 0,
        typeof s.eth === "number" ? s.eth : 0
      );
    } catch {
      /* best-effort */
    }
  }, [applyAbsolute]);

  // Poll — faster while a local bot is running, cached/relaxed when idle.
  useEffect(() => {
    load();
    const id = setInterval(load, live ? 4000 : 12000);
    return () => clearInterval(id);
  }, [load, live]);

  // React to the local bot: each confirmed buy nudges the ticker at the real
  // rate; running toggles the fresher poll cadence.
  useEffect(() => {
    const onBuy = (e: Event) => {
      const amt = (e as CustomEvent).detail?.amt || 0;
      target.current = {
        buys: target.current.buys + 1,
        eth: target.current.eth + amt,
      };
      if (!inited.current) {
        inited.current = true;
        disp.current = { ...target.current };
        setDispBuys(disp.current.buys);
        setDispEth(disp.current.eth);
      } else {
        scheduleTick();
      }
    };
    const onRunning = (e: Event) => {
      const v = !!(e as CustomEvent).detail;
      liveRef.current = v;
      setLive(v);
    };
    window.addEventListener("hoodprint:buy", onBuy);
    window.addEventListener("hoodprint:running", onRunning);
    return () => {
      window.removeEventListener("hoodprint:buy", onBuy);
      window.removeEventListener("hoodprint:running", onRunning);
    };
  }, [scheduleTick]);

  useEffect(
    () => () => {
      if (tickTimer.current) clearTimeout(tickTimer.current);
    },
    []
  );

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
