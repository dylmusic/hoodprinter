import type { Metadata } from "next";
import SwapEmbed from "@/components/SwapEmbed";
import SiteNav from "@/components/SiteNav";
import { siteConfig } from "@/site.config";

// Live in SiteNav + sitemap as of 2026-07-24 — this is now THE primary buy
// link sitewide (site.config.ts PRESALE_LINK = "/swap"). $PRINT's 5%
// transfer tax breaks a plain Uniswap swap UI, so this embeds Relay's own
// SwapWidget (@reservoir0x/relay-kit-ui — the React 18-compatible package;
// Relay's newer @relayprotocol scope requires React 19, which this Next
// 14/React 18 app isn't on) instead of a hand-rolled quote UI. That gets
// Relay's full any-token/any-chain interface, not locked to $PRINT as the
// destination — it just defaults to ETH -> $PRINT on Robinhood Chain on
// load. Collects a 0.85% HOODPrinter fee via Relay's native appFees
// mechanism on every swap, not just $PRINT ones (see components/SwapEmbed.tsx).
export const metadata: Metadata = {
  title: "Swap — HOODPrinter",
  description: `Swap any token, any chain — defaults to ETH for ${siteConfig.symbol} on Robinhood Chain via Relay.`,
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
            <span className="rwa-beta-tag">BETA</span>
          </h1>
          <p>Any chain ⇄ $PRINT on Robinhood Chain</p>
        </div>

        <SwapEmbed />

        <p className="swap-powered-by">
          Powered by <span>relay.link</span>
        </p>
      </main>
    </>
  );
}
