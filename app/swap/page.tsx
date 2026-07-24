import type { Metadata } from "next";
import PrintDirectSwap from "@/components/PrintDirectSwap";
import SiteNav from "@/components/SiteNav";
import { siteConfig } from "@/site.config";

// Our own router (components/PrintDirectSwap.tsx) — any Robinhood Chain
// token to any other. Built because Relay's routing for $PRINT was picking
// the wrong on-chain pool: there are 3 ETH/PRINT Uniswap V4 pools on
// Robinhood Chain (confirmed via PoolManager Initialize events), only
// 0xf19f1556...27075 has our tax hook + real liquidity, the other two are
// hookless decoy pools with near-zero depth, and Relay's API has no way to
// pin a specific pool (`includedSwapSources` only filters by DEX name,
// which doesn't distinguish between the 3 pools — confirmed empirically).
// So any leg touching $PRINT always goes through our own known-correct
// pool via the Universal Router's V4Router path (lib/printDirectSwap.ts);
// everything else (an ordinary token that isn't $PRINT) is routed through
// Relay's headless SDK (lib/relayLeg.ts), same-chain only for now — see
// CLAUDE.md "Swap" for the full architecture and the multichain follow-up.
// components/SwapEmbed.tsx (the old full-widget version) is untouched and
// still here, unused, in case Relay ever adds pool-level pinning.
export const metadata: Metadata = {
  title: "Swap — HOODPrinter",
  description: `Swap any Robinhood Chain token for ${siteConfig.symbol}, routed safely through the real pool.`,
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
          <p>Any Robinhood Chain asset ⇄ $PRINT</p>
          <p className="swap-subnote">⚠️ Multi-Chain Coming Soon</p>
        </div>

        <PrintDirectSwap />
      </main>
    </>
  );
}
