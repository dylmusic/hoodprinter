import type { Metadata } from "next";
import MultiSender from "@/components/MultiSender";
import SiteNav from "@/components/SiteNav";
import { siteConfig } from "@/site.config";

const title = "Multisend — Robinhood Chain Airdrop Tool | Send Tokens to Thousands of Wallets";
const description =
  "The Robinhood Chain airdrop tool: free multisend / disperse for any ERC-20 token. Paste a list of addresses and batch-send to thousands of wallets in minutes — airdrops, rewards, and payouts at sub-cent gas.";

export const metadata: Metadata = {
  title: "Multisend — Robinhood Chain Airdrop Tool",
  description,
  alternates: { canonical: "/multisend" },
  keywords: [
    "Robinhood Chain airdrop tool",
    "Robinhood Chain multisend",
    "Robinhood Chain disperse",
    "airdrop tokens on Robinhood Chain",
    "token airdrop tool",
    "multisender",
    "bulk token sender",
    "batch token transfer",
    "send tokens to multiple wallets",
    "disperse app alternative",
    "HOODPrinter",
    "$PRINT",
  ],
  openGraph: {
    title,
    description,
    url: "https://hoodprinter.xyz/multisend",
    siteName: siteConfig.name,
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/brand/og-multisend.png",
        width: 1200,
        height: 630,
        alt: "HOODPrinter Multisend — send any Robinhood Chain token to thousands of wallets",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@HOODPrinterxyz",
    creator: "@HOODPrinterxyz",
    title,
    description,
    images: ["/brand/og-multisend.png"],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      name: "HOODPrinter Multisend",
      alternateName: "Robinhood Chain Airdrop Tool",
      url: "https://hoodprinter.xyz/multisend",
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
          name: "How do I airdrop tokens on Robinhood Chain?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Use HOODPrinter Multisend: load the token's contract address, paste your list of recipient addresses (with optional per-wallet amounts), and press send. It batch-sends the airdrop wallet by wallet in confirmation waves — thousands of transfers clear in minutes at sub-cent gas.",
          },
        },
        {
          "@type": "Question",
          name: "What does the Robinhood Chain airdrop tool cost?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Multisend is free — you only pay network gas, which is sub-cent per transfer on Robinhood Chain. There are no contract approvals and no service fees.",
          },
        },
        {
          "@type": "Question",
          name: "Can I multisend any token on Robinhood Chain?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes — any ERC-20 on Robinhood Chain works. Paste its contract address and Multisend reads the symbol and decimals automatically. A preflight check catches tokens that block transfers before any gas is spent.",
          },
        },
      ],
    },
  ],
};

export default function MultisendPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteNav />
      <main className="pb-page">
        <div className="pb-head">
          <h1>
            Robinhood Chain <span className="green">Multisend</span>
          </h1>
          <p>The Robinhood Chain airdrop tool — send any token to thousands of wallets</p>
          <p className="pb-tagline">
            Paste a list, load a token, press send — the printer does the rest.
          </p>
        </div>
        <MultiSender />

        <section className="ms-about">
          <h2>The airdrop &amp; disperse tool for Robinhood Chain</h2>
          <p>
            Robinhood Chain launched without a multisender — the classic
            disperse contract isn&rsquo;t deployed here. HOODPrinter Multisend
            fills the gap: batch-send <strong>any ERC-20 token</strong> to a
            pasted list of addresses, straight from a dedicated in-browser
            wallet. No contract approvals, no per-recipient popups, and your
            private key never leaves the browser.
          </p>
          <p>
            It&rsquo;s the <strong>airdrop tool for Robinhood Chain</strong>:
            drop tokens to your community, reward holders of any token, or run
            payouts. Transfers fire in confirmation waves on Robinhood
            Chain&rsquo;s ~100&nbsp;ms blocks at sub-cent gas, so a
            thousand-wallet airdrop clears in minutes and costs pennies. Failed
            transfers are collected for one-click retry, and every send is
            verifiable on the{" "}
            <a
              href={siteConfig.chain.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Robinhood Chain explorer
            </a>
            .
          </p>
          <p>
            Multisend is free, made by the team behind{" "}
            <a href="/">HOODPrinter ($PRINT)</a> — the reflection token that
            pays holders in ETH — alongside the{" "}
            <a href="/print">Buy Bot</a>. When we print, everyone prints.
          </p>

          <h2>Airdrop questions, answered</h2>
          <div className="faq-list">
            <details className="faq-item">
              <summary>How do I airdrop tokens on Robinhood Chain?</summary>
              <div className="faq-body">
                Use Multisend above: load the token&rsquo;s contract address,
                paste your list of recipient addresses (with optional
                per-wallet amounts), and press send. It batch-sends the
                airdrop wallet by wallet in confirmation waves — thousands of
                transfers clear in minutes at sub-cent gas.
              </div>
            </details>
            <details className="faq-item">
              <summary>What does the airdrop tool cost?</summary>
              <div className="faq-body">
                Multisend is <strong>free</strong> — you only pay network gas,
                which is sub-cent per transfer on Robinhood Chain. No contract
                approvals, no service fees.
              </div>
            </details>
            <details className="faq-item">
              <summary>Can I multisend any token on Robinhood Chain?</summary>
              <div className="faq-body">
                Yes — any ERC-20 on Robinhood Chain works. Paste its contract
                address and Multisend reads the symbol and decimals
                automatically. A preflight check catches tokens that block
                transfers before any gas is spent.
              </div>
            </details>
          </div>
        </section>
      </main>
    </>
  );
}
