"use client";

import { useEffect, useState } from "react";
import { siteConfig } from "@/site.config";

/**
 * Branded interstitial for the fair-launch CTAs. Mounted once globally
 * (root layout); it delegates clicks on any `[data-fairlaunch]` link, stops
 * the jump to BasedBid, and nudges people into the Telegram first so they get
 * official updates and don't miss anything. "View on based.bid" opens the
 * real launch URL (captured from the link that was clicked).
 *
 * The based.bid sale itself sold out — this now communicates bonding status
 * rather than inviting a buy. Update this copy again once bonded / live on
 * the DEX.
 *
 * No-JS / crawlers still get a normal link to the launch — the href is intact.
 */
export default function FairLaunchModal() {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // Let modified / non-primary clicks (new tab, etc.) behave normally.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const el = e.target as HTMLElement | null;
      const link = el?.closest?.("[data-fairlaunch]") as HTMLAnchorElement | null;
      if (!link) return;
      e.preventDefault();
      setUrl(link.href || siteConfig.presaleLink);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    if (!url) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setUrl(null);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [url]);

  if (!url) return null;

  const proceed = () => {
    window.open(url, "_blank", "noopener,noreferrer");
    setUrl(null);
  };

  return (
    <div
      className="flm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="flm-title"
      onClick={() => setUrl(null)}
    >
      <div className="flm-card" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="flm-x"
          onClick={() => setUrl(null)}
          aria-label="Close"
        >
          ✕
        </button>
        <div className="flm-emoji" aria-hidden="true">✅</div>
        <h3 className="flm-title" id="flm-title">
          Fair launch complete
        </h3>
        <p className="flm-body">
          The based.bid fair launch is <strong>sold out</strong> — thank you
          for printing with us. $PRINT is bonding now; once that&rsquo;s done,
          trading opens on the DEX. Join our Telegram for the latest and the{" "}
          <strong>official contract &amp; links</strong>.
        </p>
        <a
          className="flm-btn flm-tg"
          href={siteConfig.telegram}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span aria-hidden="true">✈️</span> Join the Telegram
        </a>
        <button type="button" className="flm-btn flm-go" onClick={proceed}>
          View on based.bid →
        </button>
        <span className="flm-note">Bonding in progress · the printer starts soon</span>
      </div>
    </div>
  );
}
