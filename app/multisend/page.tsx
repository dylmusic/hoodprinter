import type { Metadata } from "next";
import MultiSender from "@/components/MultiSender";
import SiteNav from "@/components/SiteNav";
import { siteConfig } from "@/site.config";

const title = "Multisend — Send Tokens to Thousands of Wallets on Robinhood Chain";
const description =
  "Free multisend / disperse tool for Robinhood Chain. Paste a list of addresses, load any ERC-20 token, and batch-send to thousands of wallets in minutes — airdrops, rewards, and payouts at sub-cent gas.";

export const metadata: Metadata = {
  title: "Multisend",
  description,
  alternates: { canonical: "/multisend" },
  keywords: [
    "Robinhood Chain multisend",
    "Robinhood Chain disperse",
    "multisender",
    "bulk token sender",
    "batch token transfer",
    "airdrop tool",
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
  "@type": "WebApplication",
  name: "HOODPrinter Multisend",
  url: "https://hoodprinter.xyz/multisend",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  description,
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
          <p>Send any token to thousands of wallets in one run</p>
          <p className="pb-tagline">
            Paste a list, load a token, press send — the printer does the rest.
          </p>
        </div>
        <MultiSender />

        <section className="ms-about">
          <h2>The disperse tool for Robinhood Chain</h2>
          <p>
            Robinhood Chain launched without a multisender — the classic
            disperse contract isn&rsquo;t deployed here. HOODPrinter Multisend
            fills the gap: batch-send <strong>any ERC-20 token</strong> to a
            pasted list of addresses, straight from a dedicated in-browser
            wallet. No contract approvals, no per-recipient popups, and your
            private key never leaves the browser.
          </p>
          <p>
            It&rsquo;s built for airdrops, community rewards, and holder
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
        </section>
      </main>
    </>
  );
}
