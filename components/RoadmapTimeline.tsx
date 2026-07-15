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
        title: "Launchpad Secured",
        desc: "Fair launch venue locked in — a safe, transparent launch for Robinhood Chain.",
        status: "done",
      },
      {
        title: "Fair Launch",
        desc: "$PRINT is launching fair — LIVE NOW. No early allocations, everyone buys in at the same price.",
        status: "active",
        href: PRESALE_LINK,
        hrefLabel: "Buy $PRINT →",
      },
    ],
  },
  {
    num: "02",
    name: "The Buy Bot",
    items: [
      {
        title: "Buy Bot Beta Testing",
        desc: "The HOOD Printer buy bot is live in beta — auto-buy any Robinhood Chain token in one click from a dedicated in-browser wallet.",
        status: "active",
        href: "/print",
        hrefLabel: "Try the beta →",
      },
      {
        title: "Live Volume Tracking & Ranks",
        desc: "Platform-wide buy counter, personal stats, and a Bronze → Diamond rank ladder that levels up as you print.",
        status: "done",
      },
      {
        title: "Buy Bot v2 — On-Chain Buy Router",
        desc: "A major upgrade from the beta: every buy now routes through the canonical, verified HOODPrinter Buy Router contract — stamping HOODPrinter's volume and gas on-chain and recording provable per-wallet buy stats. All beta progress carries over seamlessly; you keep leveling up on the same ranks.",
        status: "done",
        href: "https://robinhoodchain.blockscout.com/address/0x0e211d54b747832B28a9C8cA74e35069b0049653?tab=contract",
        hrefLabel: "View the Buy Router contract →",
      },
      {
        title: "Buy Bot Public Launch",
        desc: "A polished, mobile-first public release — open to every trader on Robinhood Chain.",
        status: "upcoming",
      },
      {
        title: "The $PRINT Flywheel",
        desc: "Hold $PRINT in your bot wallet and its ETH reflections refuel your auto-buys — rewards become buying power, automatically.",
        status: "upcoming",
      },
      {
        title: "Level-Up Rewards",
        desc: "Rank up to unlock real rewards — the higher your tier, the more the printer pays.",
        status: "upcoming",
      },
      {
        title: "Advanced Automation",
        desc: "Multi-wallet campaigns, scheduling, budget caps, and smarter buy strategies.",
        status: "upcoming",
      },
    ],
  },
  {
    num: "03",
    name: "The Multisender",
    items: [
      {
        title: "Designing the First Robinhood Chain Multisender",
        desc: "Robinhood Chain launched with no way to bulk-send tokens — no multisend contract existed on the chain. We set out to build the first one.",
        status: "done",
      },
      {
        title: "Multisend Tool Launched",
        desc: "A public bulk sender went live — airdrop any token to a pasted list of wallets, straight from your dedicated in-browser wallet.",
        status: "done",
        href: "/multisend",
        hrefLabel: "Open Multisend →",
      },
      {
        title: "First Multisend Contract Deployed & Verified on Robinhood Chain",
        desc: "The HOODPrinter Multisend contract — ownerless and permissionless — deployed and source-verified on-chain. One transaction now fans out to ~150 wallets. A first for the chain.",
        status: "done",
        href: "https://robinhoodchain.blockscout.com/address/0x891172B6d7ad82774025C045f6eae517817a6269?tab=contract",
        hrefLabel: "View the verified contract →",
      },
    ],
  },
  {
    num: "04",
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
    num: "05",
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
    num: "06",
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
                      {...(m.href.startsWith("http")
                        ? { target: "_blank", rel: "noopener noreferrer" }
                        : {})}
                      {...(m.href === PRESALE_LINK ? { "data-fairlaunch": true } : {})}
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
