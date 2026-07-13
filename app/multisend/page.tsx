import type { Metadata } from "next";
import MultiSender from "@/components/MultiSender";
import SiteNav from "@/components/SiteNav";
import { siteConfig } from "@/site.config";

const title = "Multisend — Robinhood Chain Airdrop Tool | Send Tokens to Thousands of Wallets";
const description =
  "The Robinhood Chain airdrop tool, powered by the first multisend contract deployed & verified on the chain. Paste a list of addresses and batch-send any ERC-20 to thousands of wallets in minutes — airdrops, rewards, and payouts at sub-cent gas.";

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
    "first Robinhood Chain multisend contract",
    "verified multisend contract",
    "onchain multisend contract",
    "HOODPrinter",
    "$PRINT",
  ],
  openGraph: {
    title,
    description,
    url: "https://www.hoodprinter.xyz/multisend",
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
      url: "https://www.hoodprinter.xyz/multisend",
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
            text: "Use HOODPrinter Multisend: load the token's contract address, paste your list of recipient addresses (with optional per-wallet amounts), and press send. It routes through the HOODPrinter Multisend contract, sending up to ~150 wallets per transaction, so thousands of transfers clear in minutes at sub-cent gas.",
          },
        },
        {
          "@type": "Question",
          name: "What does the Robinhood Chain airdrop tool cost?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Multisend is free — you only pay network gas, which is sub-cent per transfer on Robinhood Chain (plus a one-time token approval the first time you send a given token, also sub-cent). No service fees, and no external wallet to connect — the dedicated in-browser wallet signs everything for you.",
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
          <a className="pb-logo-link" href="/" aria-label="Back to HOOD Printer home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="pb-logo" src="/logo.png" alt="HOOD Printer" />
          </a>
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
          <h2>The airdrop &amp; multisend tool for Robinhood Chain</h2>
          <p>
            Robinhood Chain launched without a multisender, so we built and
            deployed the <strong>first one</strong> — an ownerless, permissionless
            multisend contract, source-verified on-chain. HOODPrinter Multisend
            batch-sends <strong>any ERC-20 token</strong> to a pasted list of
            addresses in one transaction per ~150 wallets, straight from a
            dedicated in-browser wallet whose private key never leaves your
            browser. No wallet to connect and no approval popups — that
            in-browser wallet signs everything for you, including a one-time
            approval the first time you send each token. The contract is
            ownerless, permissionless, and{" "}
            <a
              href={`${siteConfig.chain.explorerUrl}/address/0x891172B6d7ad82774025C045f6eae517817a6269?tab=contract`}
              target="_blank"
              rel="noopener noreferrer"
            >
              source-verified on the Robinhood Chain explorer
            </a>
            .
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
                per-wallet amounts), and press send. It routes through the
                HOODPrinter Multisend contract — one transaction per ~150
                wallets — so thousands of transfers clear in minutes at
                sub-cent gas.
              </div>
            </details>
            <details className="faq-item">
              <summary>What does the airdrop tool cost?</summary>
              <div className="faq-body">
                Multisend is <strong>free</strong> — you only pay network gas,
                which is sub-cent per transfer on Robinhood Chain (plus a
                one-time token approval the first time you send a token, also
                sub-cent). No service fees, and no external wallet to connect —
                the dedicated in-browser wallet signs everything for you.
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
