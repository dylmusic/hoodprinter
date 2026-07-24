import type { Metadata } from "next";
import SwapWidget from "@/components/SwapWidget";
import SiteNav from "@/components/SiteNav";
import { siteConfig } from "@/site.config";

// Unlisted / in-progress: not in SiteNav, not in the sitemap, noindex until
// this is confirmed working end-to-end. $PRINT's 5% transfer tax breaks a
// plain Uniswap swap UI, so this routes through Relay (relay.link) — verified
// live against Robinhood Chain and $PRINT's taxed pool — instead of
// hand-rolled Universal Router calldata. Collects a 0.85% HOODPrinter fee via
// Relay's native appFees mechanism (see app/api/relay/quote).
export const metadata: Metadata = {
  title: "Swap — HOODPrinter",
  description: `Swap ETH for ${siteConfig.symbol} on Robinhood Chain via Relay.`,
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
          <p>ETH ⇄ any Robinhood Chain token</p>
        </div>

        <SwapWidget />

        <section className="swap-about">
          <div className="faq-list">
            <details className="faq-item">
              <summary>Why not just swap on Uniswap directly?</summary>
              <div className="faq-body">
                $PRINT&rsquo;s liquidity sits in a Uniswap V4 pool with a hook
                that enforces the 5% trade tax, so a plain swap UI
                miscalculates the output and the transaction reverts or shorts
                you. This page routes through{" "}
                <a href="https://relay.link" target="_blank" rel="noopener noreferrer">
                  Relay
                </a>
                , an aggregator that actually supports Robinhood Chain, with
                slippage set high enough to absorb the tax. The pool is live
                and tradeable — it just needs a router that accounts for the
                tax, which a default swap widget doesn&rsquo;t.
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
