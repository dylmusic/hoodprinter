"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import NavSocials from "@/components/NavSocials";
import { PRESALE_ACTIVE, PRESALE_LINK } from "@/site.config";

/**
 * Shared site navigation. `variant="home"` shows section anchors; every other
 * page uses `variant="sub"` with page links. The Tools dropdown groups the
 * product pages (Buy Bot, Multisend) so the bar stays lean as tools ship.
 * On mobile (≤720px) the text links collapse into a hamburger menu that
 * replaces the Level Up button — Level Up lives inside the menu instead.
 */
export default function SiteNav({ variant = "sub" }: { variant?: "home" | "sub" }) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // Close the dropdown / mobile menu on outside click / Escape.
  useEffect(() => {
    if (!toolsOpen && !menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (toolsOpen && !toolsRef.current?.contains(e.target as Node)) {
        setToolsOpen(false);
      }
      if (menuOpen && !navRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setToolsOpen(false);
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [toolsOpen, menuOpen]);

  const close = () => setMenuOpen(false);

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
          <a href="/rwa" role="menuitem">
            <span className="nd-title">
              RWA Pools <span className="nav-beta">BETA</span>
            </span>
            <span className="nd-sub">$PRINT paired with tokenized stocks</span>
          </a>
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
            <span className="nd-sub">Airdrop any token to thousands of wallets</span>
          </a>
        </div>
      )}
    </div>
  );

  return (
    <nav className="nav" ref={navRef}>
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
          {PRESALE_ACTIVE ? (
            <a
              className="btn btn-primary"
              href={PRESALE_LINK}
              target="_blank"
              rel="noopener noreferrer"
              data-fairlaunch
            >
              Fair Launch LIVE
            </a>
          ) : (
            <a className="btn btn-primary" href="/print">
              Level Up
            </a>
          )}
        </div>
        <button
          type="button"
          className={`nav-burger${menuOpen ? " open" : ""}`}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {menuOpen && (
        <div className="nav-mobile" role="menu">
          {variant === "home" ? (
            <>
              <a href="#how-it-works" onClick={close}>How It Works</a>
              <a href="#tokenomics" onClick={close}>Tokenomics</a>
              <a href="/roadmap" onClick={close}>Roadmap</a>
              <a href="/airdrop" onClick={close}>Airdrop</a>
              <a href="#faq" onClick={close}>FAQ</a>
            </>
          ) : (
            <>
              <a href="/" onClick={close}>Home</a>
              <a href="/roadmap" onClick={close}>Roadmap</a>
              <a href="/airdrop" onClick={close}>Airdrop</a>
            </>
          )}
          <div className="nav-mobile-label">Tools</div>
          <a className="nav-mobile-tool" href="/rwa" onClick={close}>
            <span className="nd-title">
              RWA Pools <span className="nav-beta">BETA</span>
            </span>
            <span className="nd-sub">$PRINT paired with tokenized stocks</span>
          </a>
          <a className="nav-mobile-tool" href="/print" onClick={close}>
            <span className="nd-title">
              Buy Bot <span className="nav-beta">BETA</span>
            </span>
            <span className="nd-sub">Auto-buy any Robinhood Chain token</span>
          </a>
          <a className="nav-mobile-tool" href="/multisend" onClick={close}>
            <span className="nd-title">
              Multisend <span className="nav-new">NEW</span>
            </span>
            <span className="nd-sub">Airdrop any token to thousands of wallets</span>
          </a>
          {PRESALE_ACTIVE ? (
            <a
              className="btn btn-primary nav-mobile-cta"
              href={PRESALE_LINK}
              target="_blank"
              rel="noopener noreferrer"
              onClick={close}
              data-fairlaunch
            >
              Fair Launch LIVE
            </a>
          ) : (
            <a className="btn btn-primary nav-mobile-cta" href="/print" onClick={close}>
              Level Up
            </a>
          )}
        </div>
      )}
    </nav>
  );
}
