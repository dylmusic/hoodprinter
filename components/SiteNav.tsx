"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import NavSocials from "@/components/NavSocials";

/**
 * Shared site navigation. `variant="home"` shows section anchors; every other
 * page uses `variant="sub"` with page links. The Tools dropdown groups the
 * product pages (Buy Bot, Multisend) so the bar stays lean as tools ship.
 */
export default function SiteNav({ variant = "sub" }: { variant?: "home" | "sub" }) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click / Escape.
  useEffect(() => {
    if (!toolsOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!toolsRef.current?.contains(e.target as Node)) setToolsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setToolsOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [toolsOpen]);

  const tools = (
    <div
      className="nav-tools"
      ref={toolsRef}
      onMouseEnter={() => setToolsOpen(true)}
      onMouseLeave={() => setToolsOpen(false)}
    >
      <button
        type="button"
        className={`nav-tools-btn${toolsOpen ? " open" : ""}`}
        aria-expanded={toolsOpen}
        aria-haspopup="menu"
        onClick={() => setToolsOpen((o) => !o)}
      >
        Tools <span className="nav-beta">BETA</span>{" "}
        <span className="nav-caret" aria-hidden="true">▾</span>
      </button>
      {toolsOpen && (
        <div className="nav-drop" role="menu">
          <a href="/print" role="menuitem">
            <span className="nd-title">
              Buy Bot <span className="nav-beta">BETA</span>
            </span>
            <span className="nd-sub">Auto-buy any Robinhood Chain token</span>
          </a>
          <a href="/multisend" role="menuitem">
            <span className="nd-title">
              Multisend <span className="nav-new">NEW</span>
            </span>
            <span className="nd-sub">Send tokens to thousands of wallets</span>
          </a>
        </div>
      )}
    </div>
  );

  return (
    <nav className="nav">
      <div className="container nav-inner">
        <a href="/" className="nav-logo">
          <Image
            src="/brand/logo-icon.svg?v=2"
            alt="HOODPrinter logo"
            width={36}
            height={36}
            unoptimized
          />
          HOODPrinter
        </a>
        <NavSocials />
        <div className="nav-links">
          {variant === "home" ? (
            <>
              <a href="#how-it-works">How It Works</a>
              <a href="#tokenomics">Tokenomics</a>
              <a href="/roadmap">Roadmap</a>
              <a href="/airdrop">Airdrop</a>
              {tools}
              <a href="#faq">FAQ</a>
            </>
          ) : (
            <>
              <a href="/">Home</a>
              <a href="/roadmap">Roadmap</a>
              <a href="/airdrop">Airdrop</a>
              {tools}
            </>
          )}
          <a className="btn btn-primary" href="/print">
            Level Up
          </a>
        </div>
      </div>
    </nav>
  );
}
