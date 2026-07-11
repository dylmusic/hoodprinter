import type { Metadata } from "next";
import PrintBot from "@/components/PrintBot";
import PlatformStatsNote from "@/components/PlatformStatsNote";

const title = "Buy Bot — Auto-Buy Any Robinhood Chain Token";
const description =
  "Auto-buy any token on Robinhood Chain in one click and create real, on-chain buy volume. Level up as you print and climb the ranks for the $PRINT airdrop. Beta now live.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/print" },
  keywords: [
    "Robinhood Chain buy bot",
    "auto buy bot",
    "crypto volume bot",
    "buy volume generator",
    "Robinhood Chain trading bot",
    "$PRINT",
    "HOODPrinter",
  ],
  openGraph: {
    title: `HOOD Printer Buy Bot — Auto-Buy Any Robinhood Chain Token`,
    description,
    url: "https://hoodprinter.xyz/print",
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

export default function PrintPage() {
  return (
    <main className="pb-page">
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
          Use HOOD Printer to create automatic buy volume for any project on
          Robinhood.
        </p>
      </div>
      <PrintBot />
    </main>
  );
}
