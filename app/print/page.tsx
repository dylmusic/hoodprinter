import type { Metadata } from "next";
import PrintBot from "@/components/PrintBot";
import PlatformStatsNote from "@/components/PlatformStatsNote";
import PreLaunchFlag from "@/components/PreLaunchFlag";
import SiteNav from "@/components/SiteNav";

const title = "Buy Bot — Robinhood Chain Volume Bot | Auto-Buy Any Token";
const description =
  "The Robinhood Chain volume bot: auto-buy any token in one click and create real, on-chain buy volume through the verified HOODPrinter Buy Router contract. Level up as you print and climb the ranks for the $PRINT airdrop.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/print" },
  keywords: [
    "Robinhood volume bot",
    "Robinhood Chain volume bot",
    "Robinhood buy bot",
    "Robinhood Chain buy bot",
    "auto buy bot",
    "crypto volume bot",
    "buy volume generator",
    "Robinhood Chain trading bot",
    "on-chain buy bot",
    "verified buy bot contract",
    "$PRINT",
    "HOODPrinter",
  ],
  openGraph: {
    title: `HOOD Printer Buy Bot — Auto-Buy Any Robinhood Chain Token`,
    description,
    url: "https://www.hoodprinter.xyz/print",
    siteName: "HOODPrinter",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/brand/og-print.png?v=2",
        width: 1200,
        height: 630,
        alt: "HOODPrinter Buy Bot — auto-buy any Robinhood Chain token in one click",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@HOODPrinterxyz",
    creator: "@HOODPrinterxyz",
    title: `HOOD Printer Buy Bot — Auto-Buy Any Robinhood Chain Token`,
    description,
    images: ["/brand/og-print.png?v=2"],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "HOODPrinter Buy Bot",
  alternateName: ["Robinhood Chain Buy Bot", "Robinhood Volume Bot"],
  url: "https://www.hoodprinter.xyz/print",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  description,
};

export default function PrintPage() {
  return (
    <>
      <SiteNav />
      <PreLaunchFlag />
      <main className="pb-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="pb-head">
        <a className="pb-logo-link" href="/" aria-label="Back to HOOD Printer home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="pb-logo" src="/logo.png" alt="HOOD Printer" />
        </a>
        <h1>
          Robinhood Chain <span className="green">Buy Bot</span>
        </h1>
        <PlatformStatsNote />
        <p>Auto-buy any token on Robinhood Chain</p>
        <p className="pb-tagline">
          Hold <span className="green">$PRINT</span> to automatically buy any
          token with your ETH rewards.
        </p>
        <p className="pb-tagline pb-tagline-sub">
          The volume bot for Robinhood Chain — create automatic buy volume
          for any project.
        </p>
        <p className="pb-tagline pb-tagline-sub">
          Every buy runs on-chain through our{" "}
          <a
            href="https://robinhoodchain.blockscout.com/address/0x0e211d54b747832B28a9C8cA74e35069b0049653?tab=contract"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--green)" }}
          >
            verified HOODPrinter Buy Router
          </a>{" "}
          contract.
        </p>
      </div>
      <PrintBot />
      </main>
    </>
  );
}
