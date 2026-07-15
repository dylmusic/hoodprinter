"use client";

import { useEffect, useState } from "react";
import { FAIR_LAUNCH_AT, PRESALE_LINK } from "@/site.config";

/**
 * Countdown to the $PRINT fair launch on BasedBid. Ticks every second to
 * FAIR_LAUNCH_AT; once the clock hits zero it flips to a "LIVE NOW" state that
 * links straight to the launch. Rendered client-side only (the first paint is
 * skipped) so the server/client don't disagree on the remaining time.
 */

type Parts = { d: number; h: number; m: number; s: number; done: boolean };

function remaining(target: number): Parts {
  const ms = target - Date.now();
  if (ms <= 0) return { d: 0, h: 0, m: 0, s: 0, done: true };
  let s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  return { d, h, m, s, done: false };
}

const pad = (n: number) => String(n).padStart(2, "0");

export default function LaunchCountdown() {
  const target = new Date(FAIR_LAUNCH_AT).getTime();
  const [t, setT] = useState<Parts | null>(null);

  useEffect(() => {
    setT(remaining(target));
    const id = setInterval(() => setT(remaining(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  // Skip the very first (server) render to avoid a hydration mismatch.
  if (!t) return null;

  if (t.done) {
    return (
      <a
        className="cd cd-live"
        href={PRESALE_LINK}
        target="_blank"
        rel="noopener noreferrer"
        data-fairlaunch
      >
        <span className="cd-live-dot" aria-hidden="true" />
        Fair Launch Live Now
      </a>
    );
  }

  const cells: Array<[number, string]> = [
    [t.d, "Days"],
    [t.h, "Hrs"],
    [t.m, "Min"],
    [t.s, "Sec"],
  ];

  return (
    <div className="cd" role="timer" aria-label="Time until $PRINT fair launch">
      <span className="cd-label">🖨️ $PRINT Fair Launch begins in</span>
      <div className="cd-clock">
        {cells.map(([val, unit], i) => (
          <div className="cd-cell" key={unit}>
            <span className="cd-num">{i === 0 ? val : pad(val)}</span>
            <span className="cd-unit">{unit}</span>
          </div>
        ))}
      </div>
      <span className="cd-note">{launchLabel(target)} · on the BasedBid launchpad</span>
    </div>
  );
}

/** Human UTC label for the launch instant, e.g. "Jul 15, 6:00 PM UTC". */
function launchLabel(target: number): string {
  const d = new Date(target);
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = d.getUTCDate();
  let h = d.getUTCHours();
  const min = d.getUTCMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const mm = min ? `:${pad(min)}` : ":00";
  return `${month} ${day}, ${h}${mm} ${ampm} UTC`;
}
