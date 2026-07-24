import type { Metadata } from "next";
import SwapEmbed from "@/components/SwapEmbed";
import SiteNav from "@/components/SiteNav";
import { siteConfig } from "@/site.config";

// Unlisted / in-progress: not in SiteNav, not in the sitemap, noindex until
// this is confirmed working end-to-end. $PRINT's 5% transfer tax breaks a
// plain Uniswap swap UI, so this embeds Relay's own SwapWidget
// (@reservoir0x/relay-kit-ui — the React 18-compatible package; Relay's
// newer @relayprotocol scope requires React 19, which this Next 14/React 18
// app isn't on) instead of a hand-rolled quote UI. That gets Relay's real
// cross-chain interface — any of their 85+ supported origin chains, not
// just same-chain Robinhood ETH — defaulted to ETH -> $PRINT on Robinhood
// Chain, destination locked to $PRINT so this stays a "buy $PRINT" page.
// Collects a 0.85% HOODPrinter fee via Relay's native appFees mechanism
// (see components/SwapEmbed.tsx).
export const metadata: Metadata = {
  title: "Swap — HOODPrinter",
  description: `Swap ETH (or any chain) for ${siteConfig.symbol} on Robinhood Chain via Relay.`,
  robots: { index: false, follow: false },
  alternates: { canonical: "/swap" },
};

export default function SwapPage() {
  return (
    <>
      <SiteNav />
      <main className="pb-page swap-page">
        <div className="pb-head">
          <a className="pb-logo-link" href="/" aria-label="Back to HOOD Printer home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="pb-logo" src="/logo.png" alt="HOOD Printer" />
          </a>
          <h1>
            Swap <span className="green">$PRINT</span>{" "}
            <span className="rwa-beta-tag">WIP</span>
          </h1>
          <p>Any chain ⇄ $PRINT on Robinhood Chain</p>
        </div>

        <SwapEmbed />

        <section className="swap-about">
          <div className="faq-list">
            <details className="faq-item">
              <summary>Why not just swap on Uniswap directly?</summary>
              <div className="faq-body">
                $PRINT&rsquo;s liquidity sits in a Uniswap V4 pool with a hook
                that enforces the 5% trade tax, so a plain swap UI
                miscalculates the output and the transaction reverts or shorts
                you. This page embeds{" "}
                <a href="https://relay.link" target="_blank" rel="noopener noreferrer">
                  Relay&rsquo;s
                </a>{" "}
                own swap widget, which actually supports Robinhood Chain and
                accounts for the tax — and it lets you bridge in from any of
                Relay&rsquo;s 85+ supported chains and land directly in
                $PRINT in one step, not just swap ETH that&rsquo;s already on
                Robinhood Chain.
              </div>
            </details>
            <details className="faq-item">
              <summary>Is this safe?</summary>
              <div className="faq-body">
                Your wallet signs every transaction — nothing is custodial and
                no private key ever touches this site. Quotes come straight
                from Relay&rsquo;s public API. This page is unlisted while we
                finish testing it; if a swap doesn&rsquo;t look right,
                don&rsquo;t sign it.
              </div>
            </details>
          </div>
        </section>
      </main>
    </>
  );
}
