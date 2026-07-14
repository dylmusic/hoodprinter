"use client";

import { useEffect, useState } from "react";
import { siteConfig } from "@/site.config";

/**
 * Branded interstitial for the fair-launch CTAs. Mounted once globally
 * (root layout); it delegates clicks on any `[data-fairlaunch]` link, stops
 * the jump to BasedBid, and first nudges people into the Telegram so they get
 * the official links and don't miss / fake the drop. "Continue to Fair Launch"
 * opens the real launch URL (captured from the link that was clicked).
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
        <div className="flm-emoji" aria-hidden="true">🖨️</div>
        <h3 className="flm-title" id="flm-title">
          One quick step first
        </h3>
        <p className="flm-body">
          Join our Telegram before you buy — that&rsquo;s where we post the{" "}
          <strong>official contract &amp; launch links</strong>, so you don&rsquo;t
          miss the drop or get caught by a fake.
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
          Continue to Fair Launch →
        </button>
        <span className="flm-note">Fair launch on BasedBid · Jul 15, 6PM UTC</span>
      </div>
    </div>
  );
}
