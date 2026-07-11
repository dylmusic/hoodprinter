"use client";

import { useState } from "react";
import { siteConfig } from "@/site.config";

type Asset = {
  /** path under public/ */
  src: string;
  name: string;
  dims: string;
  fmt: "PNG" | "SVG";
  /** wide preview (banners / OG cards) spans two grid columns */
  wide?: boolean;
  tag?: string;
};

type AssetSection = {
  id: string;
  title: string;
  sub: string;
  /** square 1080x1080 cards — pack five per row on desktop */
  five?: boolean;
  items: Asset[];
};

const SECTIONS: AssetSection[] = [
  {
    id: "promos",
    title: "The $PRINT story",
    sub: "Square cards that explain the printer — post them as-is or thread them.",
    five: true,
    items: [
      { src: "/brand/promo/promo-1-hero.png", name: "Hold $PRINT. Get paid ETH.", dims: "1080×1080", fmt: "PNG" },
      { src: "/brand/promo/promo-2-how-it-works.png", name: "Three steps. Zero effort.", dims: "1080×1080", fmt: "PNG" },
      { src: "/brand/promo/promo-3-tokenomics.png", name: "Tokenomics on a bill", dims: "1080×1080", fmt: "PNG" },
      { src: "/brand/promo/promo-4-brrr.png", name: "BRRR.", dims: "1080×1080", fmt: "PNG" },
      { src: "/brand/promo/promo-5-join.png", name: "Join the print run", dims: "1080×1080", fmt: "PNG" },
    ],
  },
  {
    id: "buybot",
    title: "The Buy Bot pack",
    sub: "The utility angle: one-click auto-buys, spam mode, ranks, and the $PRINT flywheel.",
    five: true,
    items: [
      { src: "/brand/promo/promo-6-buybot.png", name: "Auto-buy any token", dims: "1080×1080", fmt: "PNG", tag: "BETA" },
      { src: "/brand/promo/promo-7-spam.png", name: "Set it. Spam it.", dims: "1080×1080", fmt: "PNG" },
      { src: "/brand/promo/promo-8-levels.png", name: "Every buy levels you up", dims: "1080×1080", fmt: "PNG" },
      { src: "/brand/promo/promo-9-flywheel.png", name: "The bag that refuels itself", dims: "1080×1080", fmt: "PNG" },
      { src: "/brand/promo/promo-10-beta.png", name: "The Buy Bot is live", dims: "1080×1080", fmt: "PNG" },
    ],
  },
  {
    id: "banners",
    title: "Banners",
    sub: "Drop-in headers for X profiles, Telegram, and anywhere wide.",
    items: [
      { src: "/brand/banner.png", name: "X profile banner", dims: "1500×500", fmt: "PNG", wide: true },
      { src: "/brand/banner-900x200.png", name: "Compact banner", dims: "900×200", fmt: "PNG", wide: true },
    ],
  },
  {
    id: "og",
    title: "Link cards",
    sub: "The preview cards behind every hoodprinter.xyz link — handy for articles and embeds.",
    items: [
      { src: "/brand/og.png", name: "Home", dims: "1200×630", fmt: "PNG", wide: true },
      { src: "/brand/og-print.png", name: "Buy Bot", dims: "1200×630", fmt: "PNG", wide: true },
      { src: "/brand/og-airdrop.png", name: "Airdrop", dims: "1200×630", fmt: "PNG", wide: true },
      { src: "/brand/og-roadmap.png", name: "Roadmap", dims: "1200×630", fmt: "PNG", wide: true },
    ],
  },
];

const TWEETS: { label: string; text: string }[] = [
  {
    label: "The pitch",
    text: "Most printers cost you money.\n\nThis one pays you ETH.\n\nHold $PRINT on Robinhood Chain — a 5% tax feeds the printer and the printer feeds every holder. No staking. No claiming. Brrr.\n\nhoodprinter.xyz @HOODPrinterxyz",
  },
  {
    label: "Reflections",
    text: "New rule for the new chain: get paid to hold.\n\n$PRINT prints ETH to holders on every single trade — 4% of every buy and sell goes straight back to wallets.\n\nThe printer never sleeps. hoodprinter.xyz",
  },
  {
    label: "Buy Bot",
    text: "There's a buy bot on Robinhood Chain now.\n\nAny token. One click. Nonstop.\n\nIt's in beta, it runs from your browser, and every buy levels you up before the $PRINT airdrop.\n\nhoodprinter.xyz/print",
  },
  {
    label: "The flywheel",
    text: "The $PRINT flywheel:\n\n1. Load $PRINT into your Buy Bot wallet\n2. The 5% tax pays it ETH reflections\n3. The bot spends that ETH on more buys\n\nA bag that refuels itself. Brrr. @HOODPrinterxyz",
  },
  {
    label: "Airdrop",
    text: "The $PRINT airdrop is open and it's free.\n\nFirst 100 wallets get the BIG drop. First 1,000 still get paid. After that, the printer moves on.\n\nhoodprinter.xyz/airdrop",
  },
  {
    label: "The airdrop tool",
    text: "Robinhood Chain has an airdrop tool now.\n\nPaste a list of wallets, load any token, press send — thousands of transfers in minutes at sub-cent gas. Free.\n\nBuilt by @HOODPrinterxyz. hoodprinter.xyz/multisend",
  },
  {
    label: "The short one",
    text: "Hold $PRINT. Get paid ETH. Brrr. 🖨️\n\n@HOODPrinterxyz · hoodprinter.xyz",
  },
];

function downloadName(src: string) {
  const base = src.split("/").pop() || "asset";
  return base.startsWith("hoodprinter") ? base : `hoodprinter-${base}`;
}

export default function MediaKit() {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  return (
    <>
      {SECTIONS.map((sec) => (
        <section className="mk-section" id={sec.id} key={sec.id}>
          <div className="container">
            <h2 className="mk-title">{sec.title}</h2>
            <p className="mk-sub">{sec.sub}</p>
            <div className={`mk-grid${sec.five ? " five" : ""}`}>
              {sec.items.map((a) => (
                <div className={`mk-card${a.wide ? " wide" : ""}`} key={a.src}>
                  <div className="mk-preview">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.src} alt={a.name} loading="lazy" />
                    {a.tag && <span className="mk-tag">{a.tag}</span>}
                  </div>
                  <div className="mk-meta">
                    <div className="mk-name">{a.name}</div>
                    <div className="mk-dims">
                      {a.dims} · {a.fmt}
                    </div>
                  </div>
                  <div className="mk-actions">
                    <a
                      className="mk-btn primary"
                      href={a.src}
                      download={downloadName(a.src)}
                    >
                      Download
                    </a>
                    <button
                      className="mk-btn"
                      type="button"
                      onClick={() => copy(a.src, `${siteConfig.url}${a.src}`)}
                    >
                      {copied === a.src ? "Copied!" : "Copy link"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}

      <section className="mk-section" id="logos">
        <div className="container">
          <h2 className="mk-title">The logo</h2>
          <p className="mk-sub">
            One printer, three files. That&rsquo;s all you need.
          </p>
          <div className="mk-logo-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/pfp.png" alt="HOODPrinter logo" loading="lazy" />
            <div className="mk-logo-info">
              <div className="mk-name">HOODPrinter — the capped printer</div>
              <div className="mk-dims">
                PFP-ready PNG, hi-res PNG, and a vector lockup
              </div>
            </div>
            <div className="mk-actions">
              <a className="mk-btn primary" href="/brand/pfp.png" download="hoodprinter-pfp.png">
                PFP · PNG
              </a>
              <a className="mk-btn" href="/logo.png" download="hoodprinter-logo.png">
                Hi-res · PNG
              </a>
              <a className="mk-btn" href="/brand/logo-full.svg" download="hoodprinter-lockup.svg">
                Lockup · SVG
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="mk-section" id="tweets">
        <div className="container">
          <h2 className="mk-title">Ready-to-post</h2>
          <p className="mk-sub">
            Six posts in the house voice. Copy one, grab a card above, and let
            it print — or hit Post and X opens with it pre-filled.
          </p>
          <div className="mk-tweets">
            {TWEETS.map((t) => (
              <div className="mk-tweet" key={t.label}>
                <div className="mk-tweet-head">
                  <span className="mk-tweet-label">{t.label}</span>
                  <span className="mk-tweet-count">{t.text.length} chars</span>
                </div>
                <p className="mk-tweet-text">{t.text}</p>
                <div className="mk-actions">
                  <a
                    className="mk-btn primary"
                    href={`https://x.com/intent/post?text=${encodeURIComponent(t.text)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Post on X
                  </a>
                  <button
                    className="mk-btn"
                    type="button"
                    onClick={() => copy(t.label, t.text)}
                  >
                    {copied === t.label ? "Copied!" : "Copy text"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
