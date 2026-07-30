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
const title = "Swap — Trade Any Token Across Robinhood Chain, Base, Solana & Ethereum";
const description =
  "Swap any token across Robinhood Chain, Base, Solana, and Ethereum — including $PRINT, always routed through the correct on-chain pool. No wrong-pool slippage, no external swap site, one page for same-chain and cross-chain swaps.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/swap" },
  keywords: [
    "Robinhood Chain swap",
    "Robinhood Chain DEX",
    "buy $PRINT",
    "$PRINT swap",
    "cross-chain swap",
    "Robinhood Chain bridge",
    "swap ETH for $PRINT",
    "Base Solana Ethereum swap",
    "Robinhood Chain token swap",
    "HOODPrinter",
    "$PRINT",
  ],
  openGraph: {
    title: "HOOD Printer Swap — Any Token, Any Chain, Safely Routed",
    description,
    url: "https://www.hoodprinter.xyz/swap",
    siteName: siteConfig.name,
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/brand/og-swap.png",
        width: 1200,
        height: 630,
        alt: "HOODPrinter Swap — swap any token across Robinhood Chain, Base, Solana, and Ethereum",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@HOODPrinterxyz",
    creator: "@HOODPrinterxyz",
    title: "HOOD Printer Swap — Any Token, Any Chain, Safely Routed",
    description,
    images: ["/brand/og-swap.png"],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      name: "HOODPrinter Swap",
      alternateName: "Robinhood Chain Swap",
      url: "https://www.hoodprinter.xyz/swap",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      description,
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "How do I buy $PRINT?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Use the Swap page above — pick any token as your source (ETH, USDC, or any token on Robinhood Chain, Base, Solana, or Ethereum) and $PRINT as the destination. HOODPrinter routes the $PRINT leg through our own verified pool automatically, so you always get a real quote instead of a wrong-pool price.",
          },
        },
        {
          "@type": "Question",
          name: "Can I swap from Base, Solana, or Ethereum?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes — Swap supports Robinhood Chain, Base, Solana, and Ethereum mainnet. Pick a token on any of those chains as your source and it routes cross-chain to $PRINT (or any other Robinhood Chain token) in as few as two wallet confirmations.",
          },
        },
        {
          "@type": "Question",
          name: "Why not just use a generic DEX aggregator to buy $PRINT?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "There are three ETH/$PRINT pools on Robinhood Chain, but only one has real liquidity and the correct 5% tax hook — the other two are near-empty decoys. Generic aggregators can't tell them apart and will silently quote the wrong one. HOODPrinter Swap always routes the $PRINT side of any trade through the one verified pool, so the price and slippage you see are real.",
          },
        },
        {
          "@type": "Question",
          name: "What fee does HOODPrinter Swap charge?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "0.85%, taken automatically in the same transaction as your swap — there's never a separate fee transaction to sign, and no fee at all beyond standard network gas on legs that don't touch $PRINT.",
          },
        },
      ],
    },
  ],
};

export default function SwapPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteNav />
      <main className="pb-page swap-page">
        <div className="pb-head">
          <a className="pb-logo-link" href="/" aria-label="Back to HOOD Printer home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="pb-logo" src="/logo.png" alt="HOOD Printer" />
          </a>
          <h1>
            <span className="green">$PRINT</span> Swap
          </h1>
        </div>

        <PrintDirectSwap />

        <section className="swap-about">
          <h2>The cross-chain swap for Robinhood Chain &amp; $PRINT</h2>
          <p>
            $PRINT&rsquo;s real liquidity lives in a Uniswap V4 pool with a
            hook enforcing its 5% trade tax — a plain swap UI can&rsquo;t
            account for that, and generic DEX aggregators can&rsquo;t tell
            that pool apart from two near-empty decoy pools at the same
            token pair. HOODPrinter Swap always routes the{" "}
            <strong>$PRINT</strong> side of every trade through our own
            verified pool, so the quote you see is the amount you actually
            receive.
          </p>
          <p>
            Everything else runs on <strong>Relay</strong>&rsquo;s
            cross-chain routing across four chains —{" "}
            <strong>Robinhood Chain, Base, Solana, and Ethereum</strong> —
            so you can start from any token on any of those chains and land
            in $PRINT, or swap between any two tokens on the same chain, all
            from one page.
          </p>
          <p>
            Made by the team behind <a href="/">HOODPrinter ($PRINT)</a> —
            the reflection token that pays holders in ETH — alongside the{" "}
            <a href="/print">Buy Bot</a> and <a href="/multisend">Multisend</a>.
            When we print, everyone prints.
          </p>

          <h2>Swap questions, answered</h2>
          <div className="faq-list">
            <details className="faq-item">
              <summary>How do I buy $PRINT?</summary>
              <div className="faq-body">
                Pick any token as your source — ETH, USDC, or any token on
                Robinhood Chain, Base, Solana, or Ethereum — and $PRINT as
                the destination. The $PRINT leg always routes through our
                own verified pool automatically.
              </div>
            </details>
            <details className="faq-item">
              <summary>Can I swap from Base, Solana, or Ethereum?</summary>
              <div className="faq-body">
                Yes — Swap supports Robinhood Chain, Base, Solana, and
                Ethereum mainnet. A cross-chain trade into $PRINT (or any
                other Robinhood Chain token) takes as few as two wallet
                confirmations.
              </div>
            </details>
            <details className="faq-item">
              <summary>Why not just use a generic DEX aggregator?</summary>
              <div className="faq-body">
                There are three ETH/$PRINT pools on Robinhood Chain, but
                only one has real liquidity and the correct 5% tax hook —
                the other two are near-empty decoys. Generic aggregators
                can&rsquo;t tell them apart. HOODPrinter Swap always uses
                the one verified pool.
              </div>
            </details>
            <details className="faq-item">
              <summary>What fee does HOODPrinter Swap charge?</summary>
              <div className="faq-body">
                0.85%, taken automatically in the same transaction as your
                swap — no separate fee transaction, and no fee at all on
                legs that don&rsquo;t touch $PRINT.
              </div>
            </details>
          </div>
        </section>
      </main>
    </>
  );
}
