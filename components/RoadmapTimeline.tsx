"use client";

import { useEffect, useRef, useState } from "react";
import { PRESALE_LINK } from "@/site.config";

type Status = "done" | "active" | "upcoming";

type Milestone = {
  title: string;
  desc: string;
  status: Status;
  href?: string;
  hrefLabel?: string;
};

type Phase = {
  num: string;
  name: string;
  items: Milestone[];
};

const PHASES: Phase[] = [
  {
    num: "01",
    name: "Ignition",
    items: [
      {
        title: "HOODPrinter Created",
        desc: "$PRINT deployed on Robinhood Chain. The printer comes online.",
        status: "done",
      },
      {
        title: "Website Created & Socials Launched",
        desc: "hoodprinter.xyz live, X and Telegram open to the community.",
        status: "done",
      },
      {
        title: "GemPad Partnership Established",
        desc: "Official launchpad partner secured for a safe, audited raise.",
        status: "done",
      },
      {
        title: "GemPad Presale",
        desc: "The presale is live right now — secure your allocation before launch.",
        status: "active",
        href: PRESALE_LINK,
        hrefLabel: "Join the presale →",
      },
    ],
  },
  {
    num: "02",
    name: "Launch",
    items: [
      {
        title: "LP Deployed & Locked",
        desc: "Liquidity pool seeded and locked — verifiable on-chain.",
        status: "upcoming",
      },
      {
        title: "DexScreener Listing & Boost",
        desc: "Live charts for $PRINT plus boosted visibility across DexScreener.",
        status: "upcoming",
      },
      {
        title: "Token Locks & Treasury Security Measures",
        desc: "Team tokens locked and treasury hardened with multisig controls.",
        status: "upcoming",
      },
      {
        title: "$10,000 in Rewards Distributed",
        desc: "The first print run: $10K of ETH paid out to holders.",
        status: "upcoming",
      },
    ],
  },
  {
    num: "03",
    name: "Expansion",
    items: [
      {
        title: "CoinGecko / CoinMarketCap Listing",
        desc: "$PRINT tracked on the two biggest aggregators in crypto.",
        status: "upcoming",
      },
      {
        title: "Robinhood Printer DAO",
        desc: "Governance handed to holders — the community steers the printer.",
        status: "upcoming",
      },
      {
        title: "$100,000 in Rewards Distributed",
        desc: "Six figures of ETH printed to wallets. Brrr intensifies.",
        status: "upcoming",
      },
    ],
  },
  {
    num: "04",
    name: "Ascension",
    items: [
      {
        title: "Major CEX Listing",
        desc: "$PRINT reaches centralized exchange audiences worldwide.",
        status: "upcoming",
      },
      {
        title: "$1,000,000 in Rewards Distributed",
        desc: "One million dollars of ETH in holders' wallets. The printer never sleeps.",
        status: "upcoming",
      },
    ],
  },
];

const STATUS_LABEL: Record<Status, string> = {
  done: "Complete",
  active: "In Progress",
  upcoming: "Upcoming",
};

export default function RoadmapTimeline() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onScroll = () => {
      const r = el.getBoundingClientRect();
      const anchor = window.innerHeight * 0.55;
      const passed = Math.min(Math.max(anchor - r.top, 0), r.height);
      setProgress(passed / r.height);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => {
    const items = trackRef.current?.querySelectorAll(".rm-item");
    if (!items) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("in-view");
        });
      },
      { threshold: 0.2 }
    );
    items.forEach((i) => io.observe(i));
    return () => io.disconnect();
  }, []);

  let side = 0;

  return (
    <div className="rm-track" ref={trackRef}>
      <div className="rm-line" aria-hidden="true">
        <div className="rm-line-fill" style={{ height: `${progress * 100}%` }} />
      </div>

      {PHASES.map((phase) => (
        <div key={phase.num} className="rm-phase">
          <div className="rm-phase-head">
            <span className="rm-phase-num">Phase {phase.num}</span>
            <span className="rm-phase-name">{phase.name}</span>
          </div>

          {phase.items.map((m) => {
            side += 1;
            return (
              <div
                key={m.title}
                className={`rm-item ${m.status} ${side % 2 ? "left" : "right"}`}
              >
                <span className="rm-node" aria-hidden="true" />
                <div className="rm-card">
                  <span className={`rm-status ${m.status}`}>
                    {STATUS_LABEL[m.status]}
                  </span>
                  <h3>{m.title}</h3>
                  <p>{m.desc}</p>
                  {m.href && (
                    <a
                      className="rm-link"
                      href={m.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {m.hrefLabel}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
