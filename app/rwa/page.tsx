import type { Metadata } from "next";
import RwaPools from "@/components/RwaPools";
import SiteNav from "@/components/SiteNav";
import { RWA_POOLS } from "@/lib/rwaPools";
import { siteConfig } from "@/site.config";

const title = "RWA Pools — $PRINT x Robinhood Chain Stock Tokens";
const description =
  "HOODPrinter's RWA Pools turn $PRINT's ETH reflections into $PRINT/Stock-Token liquidity on Robinhood Chain — NVDA, TSLA, SPCX, AAPL, and MSFT. Real-world-asset trading fees flow back to holders as ETH. Beta dashboard, pools not yet live.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/rwa" },
  keywords: [
    "Robinhood Chain RWA",
    "Robinhood Chain tokenized stocks",
    "RWA liquidity pool",
    "$PRINT RWA pools",
    "NVDA stock token pool",
    "TSLA stock token pool",
    "AAPL stock token pool",
    "MSFT stock token pool",
    "SPCX stock token pool",
    "Robinhood Chain Stock Tokens",
    "ETH rewards from RWA",
    "HOODPrinter",
    "$PRINT",
  ],
  openGraph: {
    title,
    description,
    url: "https://www.hoodprinter.xyz/rwa",
    siteName: siteConfig.name,
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/brand/og.png?v=4",
        width: 1200,
        height: 630,
        alt: "HOODPrinter RWA Pools — $PRINT paired with Robinhood Chain Stock Tokens",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@HOODPrinterxyz",
    creator: "@HOODPrinterxyz",
    title,
    description,
    images: ["/brand/og.png?v=4"],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      name: "HOODPrinter RWA Pools",
      alternateName: "$PRINT RWA Pools Beta",
      url: "https://www.hoodprinter.xyz/rwa",
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
          name: "What are HOODPrinter RWA Pools?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "RWA Pools pair $PRINT against Robinhood Chain's tokenized Stock Tokens (NVDA, TSLA, SPCX, AAPL, MSFT) in on-chain liquidity pools. $PRINT's 5% ETH reflection tax gets deployed into these pools instead of sitting idle, so ETH rewards are tied to real-world-asset trading activity, not just $PRINT volume.",
          },
        },
        {
          "@type": "Question",
          name: "Are the RWA pools live yet?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Not yet — this is a beta dashboard. No $PRINT/RWA liquidity pool exists on Robinhood Chain today. Every number shown (TVL, ETH distributed, positions) is real and currently zero. Deposits and withdrawals unlock once the first pools are seeded.",
          },
        },
        {
          "@type": "Question",
          name: "What are Robinhood Chain Stock Tokens?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Stock Tokens are ERC-20 tokens issued by Robinhood Assets (Jersey) Limited that track the price of US equities like NVIDIA, Tesla, and Apple via live Chainlink price feeds. They trade 24/7 and can be composed into DeFi apps, but they provide economic exposure only — not legal or shareholder rights in the underlying stock.",
          },
        },
      ],
    },
  ],
};

export default function RwaPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteNav />
      <main className="pb-page rwa-page">
        <div className="pb-head">
          <a className="pb-logo-link" href="/" aria-label="Back to HOOD Printer home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="pb-logo" src="/logo.png" alt="HOOD Printer" />
          </a>
          <h1>
            RWA <span className="green">Pools</span> <span className="rwa-beta-tag">BETA</span>
          </h1>
          <p>$PRINT paired with Robinhood Chain&rsquo;s tokenized stocks</p>
          <p className="pb-tagline">
            ETH reflections, deployed into $PRINT/RWA liquidity — the printer starts printing off
            real-world assets.
          </p>
        </div>

        <RwaPools />

        <section className="rwa-about">
          <h2>RWA Pools, answered</h2>
          <div className="faq-list">
            <details className="faq-item">
              <summary>$PRINT&rsquo;s RWA thesis</summary>
              <div className="faq-body">
                <p>
                  <a
                    href="https://docs.robinhood.com/chain/stock-tokens/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Robinhood Chain
                  </a>{" "}
                  launched July 1, 2026 as an Ethereum L2 purpose-built for tokenized real-world
                  assets — Stock Tokens like <strong>NVDA</strong>, <strong>TSLA</strong>,{" "}
                  <strong>SPCX</strong>, <strong>AAPL</strong>, and <strong>MSFT</strong> are
                  standard ERC-20s issued by Robinhood Assets (Jersey) Limited, priced live
                  on-chain via Chainlink, and built to be composed into DeFi. The catch: most of
                  the chain&rsquo;s activity so far is memecoins, not the RWAs it was built for —
                  reported TVL sits around $300M+ but only a small slice of that is actual
                  tokenized-asset liquidity.
                </p>
                <p>
                  RWA Pools are $PRINT&rsquo;s answer to that gap. $PRINT taxes every buy/sell 5%
                  and pays that ETH straight to holders — RWA Pools put the same reflections to
                  work as <strong>$PRINT/RWA liquidity</strong> instead of sitting idle.
                  Depositing $PRINT alongside a Stock Token earns a share of trading fees{" "}
                  <em>and</em> a cut of the reflection flow, so the ETH holders earn is
                  increasingly backed by real-world-asset trading, not just $PRINT speculation.
                </p>
                <p>
                  This page is the beta dashboard: the pool roster, live TVL, and ETH-distributed
                  counters are wired up and ready — they read <strong>zero</strong> because no
                  pool has been deployed yet. Each Stock Token address above is Robinhood&rsquo;s
                  real, on-chain-verified contract, linked straight to the{" "}
                  <a href={siteConfig.chain.explorerUrl} target="_blank" rel="noopener noreferrer">
                    Robinhood Chain explorer
                  </a>{" "}
                  so you can check it yourself. When the first pool goes live, this dashboard is
                  where you&rsquo;ll watch it fill.
                </p>
              </div>
            </details>
            <details className="faq-item">
              <summary>What are HOODPrinter RWA Pools?</summary>
              <div className="faq-body">
                Liquidity pools pairing $PRINT against Robinhood Chain Stock Tokens (
                {RWA_POOLS.map((p) => p.symbol).join(", ")}). $PRINT&rsquo;s ETH reflection tax
                gets deployed into these pools so ETH rewards are increasingly tied to
                real-world-asset trading activity on Robinhood Chain.
              </div>
            </details>
            <details className="faq-item">
              <summary>Are the pools live yet?</summary>
              <div className="faq-body">
                No — this is a beta dashboard. No $PRINT/RWA pair exists on-chain yet, so every
                stat here is real and currently zero. Deposit and withdraw unlock once the first
                pool is seeded; join the Telegram to catch it.
              </div>
            </details>
            <details className="faq-item">
              <summary>What are Robinhood Chain Stock Tokens?</summary>
              <div className="faq-body">
                ERC-20 tokens issued by Robinhood Assets (Jersey) Limited that track US equities
                via live Chainlink price feeds and trade 24/7. They give economic exposure only —
                not legal or shareholder rights in the underlying company.
              </div>
            </details>
          </div>
        </section>
      </main>
    </>
  );
}
