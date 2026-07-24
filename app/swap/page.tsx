import type { Metadata } from "next";
import PrintDirectSwap from "@/components/PrintDirectSwap";
import SiteNav from "@/components/SiteNav";
import { siteConfig } from "@/site.config";

// RELAY WIDGET TEMPORARILY HIDDEN (2026-07-24) — Relay's routing for $PRINT
// is picking the wrong on-chain pool. There are 3 ETH/PRINT Uniswap V4
// pools on Robinhood Chain (confirmed via PoolManager Initialize events);
// only 0xf19f1556...27075 has our tax hook + real liquidity, the other two
// are hookless decoy pools with near-zero depth. Relay was quoting off a
// decoy (~1.29M PRINT/ETH vs the real pool's ~83M+ per DexScreener) and
// its API has no way to pin a specific pool (`includedSwapSources` only
// filters by DEX name, which doesn't distinguish between the 3 pools —
// confirmed empirically, including a "no routes found" result when tried).
// So for now this page uses components/PrintDirectSwap.tsx — a basic,
// ETH->$PRINT-only swap hand-built against the KNOWN-correct pool via the
// Universal Router's V4Router path (see lib/printDirectSwap.ts for the
// full pool-key details and encoding). components/SwapEmbed.tsx (the full
// Relay-embedded any-token/any-chain widget) is untouched and still here —
// swap PrintDirectSwap back out for it once Relay's routing is fixed.
export const metadata: Metadata = {
  title: "Swap — HOODPrinter",
  description: `Swap ETH for ${siteConfig.symbol} on Robinhood Chain, routed directly through the real pool.`,
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
          <p>ETH ⇄ $PRINT on Robinhood Chain</p>
        </div>

        <PrintDirectSwap />
      </main>
    </>
  );
}
